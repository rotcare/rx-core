import { InMemDatabase, newTrace, Scene, ServiceDispatcher } from "@rotcare/io";

export function should(behavior: string, func: (scene: Scene) => void) {
    return async function(this: any) {
        const scene = new Scene(newTrace('test'), {
            tenants: { db: 'default' },
            service: new ServiceDispatcher(new InMemDatabase(), undefined as any),
        });
        scene.onAtomChanged = (atom) => {
            atom.onAtomChanged(scene.span);
        }
        return scene.execute(this, func);
    };
}
