import { Span, Scene, Atom } from '@rotcare/io';
import { Future } from './Future';
import { ChangeTracker, ReactiveObject, ref } from './reactive';
import { UiScene } from './UiScene';
import type { OmitOneArg, OmitThreeArg, OmitTwoArg } from './UiScene';

const transientProps = new Set<PropertyKey>([
    'unmounted',
    'futures',
    'subscribed',
    'props',
    'render',
]);

// 暴露给 rx-react 等实现 Widget 渲染的 Service Provider
export interface WidgetSpi {
    // 依赖订阅和刷新
    asyncDeps: Map<string, Future>;
    syncDeps: Set<Atom>;
    onAtomChanged(span: Span): void;
    refreshAsyncDeps(span: Span, isMounting: boolean): Promise<void>;
    // 生命周期
    unmounted?: boolean;
    needMountAsync: boolean;
    setupHooks(): any;
    mount(span: Span): Promise<void>;
    unmount(): void;
    attachTo(tracker: ChangeTracker): any;
}

// 展示界面，其数据来自三部分
// 父组件传递过来的 props
// 从 I/O 获得的外部状态，保存在 asyncDeps 里
// 从其他 reactive 的对象获得的外部状态，保存在 syncDeps 里
export abstract class Widget<P = any> extends ReactiveObject implements WidgetSpi {
    // 异步操作回调可能发生在组件卸载之后
    // @internal
    public unmounted?: boolean;
    // 外部状态
    public asyncDeps: Map<string, Future> = new Map();
    public syncDeps: Set<Atom> = new Set();
    // 父组件传入的 props
    public readonly props: P;
    constructor(props: P) {
        super({ props });
    }

    // 批量编辑，父子表单等类型的界面需要有可编辑的前端状态，放在本地的内存 database 里
    // onMount 的时候从 remoteService 把数据复制到内存 database 里进行编辑
    // onUnmount 的时候清理本地的内存 database
    public onMount: (scene: Scene) => Promise<void>;
    public onUnmount: (scene: Scene) => Promise<void>;
    // react 的钩子不能写在 render 里，必须写在这里
    public setupHooks(): any {}
    // 当外部状态获取完毕之后，会调用 render
    protected abstract render(hooks: ReturnType<this['setupHooks']>): any;

    // 声明一份对外部状态的依赖，async 计算过程中的所有读到的表（含RPC服务端读的表）都会被收集到依赖关系里
    // 不同于 vue 和 mobx 的细粒度状态订阅，这里实现的订阅是表级别的，而不是行级别的
    // 也就是一张表中的任意新增删除修改，都会触发所有订阅者的刷新
    protected subscribe<T>(compute: (scene: Scene) => Promise<T>): T {
        return new Future(compute, this) as any;
    }

    // 外部状态发生了变化，触发重渲染
    public onAtomChanged: (span: Span) => void;

    // @internal
    public async mount(span: Span) {
        if (this.onMount) {
            await UiScene.createRW(span).execute(this, this.onMount);
        }
        await this.refreshAsyncDeps(span, true);
    }

    // @internal
    public get needMountAsync() {
        return !!this.onMount || this.asyncDeps.size > 0;
    }

    // @internal
    public async refreshAsyncDeps(span: Span, isMounting: boolean) {
        const promises = new Map<string, Promise<any>>();
        // 并发计算
        for (const [k, future] of this.asyncDeps.entries()) {
            const scene = UiScene.createRO(span);
            const promise = scene.execute(future, future.get);
            promise.catch(span.onError);
            promises.set(k, promise);
        }
        let dirty = false;
        for (const [k, promise] of promises.entries()) {
            try {
                const v = await promise;
                if (Reflect.get(this, k) !== v) {
                    Reflect.set(this, k, v);
                    dirty = true;
                }
            } catch (e) {
                if (isMounting) {
                    throw e;
                }
            }
        }
        if (dirty && !isMounting) {
            this.onAtomChanged(span);
        }
    }

    // @internal
    public unmount() {
        this.unmounted = true;
        for (const future of this.asyncDeps.values()) {
            future.dispose();
        }
        this.asyncDeps.clear();
        for (const atom of this.syncDeps) {
            atom.deleteSubscriber(this);
        }
        this.syncDeps.clear();
        if (this.onUnmount) {
            UiScene.createRW(`unMount ${this.constructor.name}`).execute(this, this.onUnmount);
        }
    }

    protected isExecuting<M extends keyof this>(methodName: M): boolean {
        const isExecuting = ref(false);
        const method = Reflect.get(this, methodName);
        Reflect.set(this, methodName, async function (this: any, scene: Scene, ...args: any) {
            isExecuting.set(true, scene);
            await scene.sleep(0);
            try {
                return method.call(this, scene, ...args);
            } finally {
                isExecuting.set(false, scene);
            }
        });
        const future = this.subscribe(async (scene) => {
            return isExecuting.get(scene);
        }) as any;
        return future;
    }

    protected callback<M extends keyof this>(methodName: M): OmitOneArg<this[M]>;
    protected callback<M extends keyof this>(methodName: M, boundArg1: any): OmitTwoArg<this[M]>;
    protected callback<M extends keyof this>(
        methodName: M,
        boundArg1: any,
        boundArg2: any,
    ): OmitThreeArg<this[M]>;
    protected callback<M extends keyof this>(methodName: M, ...boundArgs: any[]): any {
        const cb = Reflect.get(this, methodName);
        return (...args: any[]) => {
            const traceOp = `callback ${this.constructor.name}.${methodName}`;
            const scene = UiScene.createRW(traceOp);
            return (async () => {
                try {
                    return await scene.execute(this.attachTo(scene), cb, ...boundArgs, ...args);
                } catch (e) {
                    UiScene.onUnhandledCallbackError(scene, e);
                    return undefined;
                }
            })();
        };
    }

    protected shouldTrack(propertyKey: PropertyKey) {
        if (transientProps.has(propertyKey)) {
            return false;
        }
        return super.shouldTrack(propertyKey);
    }

    public toJSON() {
        return { ...this, subscribed: undefined, futures: undefined };
    }

    public get [Symbol.toStringTag]() {
        return `[W]${this.constructor.name} with ${JSON.stringify(this.props)}`;
    }
}

for (const methodName of Object.getOwnPropertyNames(Widget.prototype)) {
    transientProps.add(methodName);
}

export type WidgetClass<T extends Widget = any> = Function & {
    new (props?: Record<string, any>): T;
};

