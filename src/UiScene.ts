import { Scene, newTrace, Span, IoConf } from "@rotcare/io";

// 整个浏览器级别的配置
export class UiScene {
    // 可以覆盖这个回调来实现全局写操作的异常处理，读操作的异常用 ErrorBoundary 去抓
    public static onUnhandledCallbackError = (scene: Scene, e: any) => {
        scene.reportEvent('unhandled callback error', { error: e });
    };
    public static ioConf: IoConf;
    public static createRW(op: string | Span) {
        return enableChangeNotification(this.create(op));
    }
    public static createRO(op: string | Span) {
        return ensureReadonly(this.create(op));
    }
    private static create(op: string | Span) {
        return new Scene(typeof op === 'string' ? newTrace(op) : op, UiScene.ioConf);
    }
}

// 给回调提供 scene，并统一捕获异常兜底
export function bindCallback<T extends (...args: any[]) => any>(
    traceOp: string,
    cb: T,
    ...boundArgs: any[]
): any;
export function bindCallback<T extends (...args: any[]) => any>(
    traceOp: string,
    cb: T,
    boundArg1: Parameters<T>[1],
    boundArg2: Parameters<T>[2],
): OmitThreeArg<T>;
export function bindCallback<T extends (...args: any[]) => any>(
    traceOp: string,
    cb: T,
    boundArg1: Parameters<T>[1],
): OmitTwoArg<T>;
export function bindCallback<T>(traceOp: string, cb: T): OmitOneArg<T>;
export function bindCallback(traceOp: string, cb: any, ...boundArgs: any[]): any {
    return (...args: any[]) => {
        const scene = UiScene.createRW(traceOp);
        return (async () => {
            try {
                return await scene.execute(undefined, cb, ...boundArgs, ...args);
            } catch (e) {
                UiScene.onUnhandledCallbackError(scene, e);
                return undefined;
            }
        })();
    };
}

// 对每个写操作的 scene 都打开改动通知
function enableChangeNotification(scene: Scene) {
    scene.span.onError = (e) => {
        UiScene.onUnhandledCallbackError(scene, e);
    };
    scene.onAtomChanged = (atom) => {
        atom.onAtomChanged(scene.span);
    };
    return scene;
}

// 读操作应该是只读的
function ensureReadonly(scene: Scene) {
    scene.onAtomChanged = (tableName) => {
        throw new Error(`detected readonly scene ${scene} changed ${tableName}`);
    };
    return scene;
}

// @internal
export type OmitOneArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
// @internal
export type OmitTwoArg<F> = F extends (x1: any, x2: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
// @internal
export type OmitThreeArg<F> = F extends (x1: any, x2: any, x3: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
