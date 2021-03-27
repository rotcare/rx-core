import { Scene, newTrace, Span, SceneConf, Atom, SpanSpi } from "@rotcare/io";

// 整个浏览器级别的配置
export class UiScene {
    // 可以覆盖这个回调来实现全局写操作的异常处理，读操作的异常用 ErrorBoundary 去抓
    public static onUnhandledCallbackError = (scene: Scene, e: any) => {
        scene.reportEvent('unhandled callback error', { error: e });
    };
    public static conf: Partial<SceneConf>;
    // 对每个写操作的 scene 都打开改动通知
    public static createRW(op: string | Span) {
        return this.create(op, (scene, atom) => {
            atom.onAtomChanged(scene.span);
        });
    }
    // 读操作应该是只读的
    public static createRO(op: string | Span) {
        return this.create(op, (scene, atom) => {
            throw new Error(`detected readonly scene ${scene} changed ${atom}`);
        });
    }
    private static create(op: string | Span, onAtomChanged: (scene: Scene, atom: Atom) => void) {
        const span = typeof op === 'string' ? newTrace(op) : op;
        const scene = new Scene(span, {...UiScene.conf, onAtomChanged});
        scene.span.onError = (e) => {
            UiScene.onUnhandledCallbackError(scene, e);
        };
        return scene;
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
