import { InMemDatabase, newTrace, Scene } from "@rotcare/io";

export function should(behavior: string, func: (scene: Scene) => void) {
    return async function(this: any) {
        const scene = new Scene(newTrace('test'), {
            database: new InMemDatabase(),
            serviceProtocol: undefined as any,
        });
        scene.onAtomChanged = (atom) => {
            atom.onAtomChanged(scene.span);
        }
        return scene.execute(this, func);
    };
}
