import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

describe('Reactive', () => {
    it(
        'direct set property',
        should('notify change', async (scene) => {
            const obj = reactive({ abc: 'hello' }).attachTo(scene);
            const future = new Future(async () => {
                return obj.abc;
            });
            strict.equal('hello', await future.get(scene));
            obj.abc = 'world';
            strict.equal('world', await future.get(scene));
        }),
    );
    it(
        'does not wrap Date',
        should('not detect change', async (scene) => {
            const obj = reactive({ abc: new Date(1) }).attachTo(scene);
            const future = new Future(async () => {
                return obj.abc.getTime();
            });
            strict.equal(1, await future.get(scene));
            obj.abc.setTime(2);
            strict.equal(1, await future.get(scene));
        }),
    );
    it(
        'read prop from reactive() without current change tracker',
        should('throw exception', async (scene) => {
            const obj = reactive({ a: 'hello' });
            let ex;
            try {
                const b = obj.a;
            } catch (e) {
                ex = e;
            }
            strict.equal(true, ex !== undefined);
        }),
    );
    it(
        'read prop from reactive()',
        should('attach to current change tracker', async (scene) => {
            const obj = reactive({ a: 'hello' });
            reactive.currentChangeTracker = scene;
            const future = new Future(async () => {
                return obj.a;
            });
            strict.equal('hello', await future.get(scene));
            obj.attachTo(scene).a = 'world';
            strict.equal('world', await future.get(scene));
        }),
    );
    it('Reactive inside another Reactive', should('not wrap twice', async (scene) => {
        const r1 = reactive({ b: 'hello' });
        const r2 = reactive({ a: [r1] }).attachTo(scene);
        const future = new Future(async () => {
            return r2.a[0].b;
        });
        strict.equal('hello', await future.get(scene));
        r2.a[0].b = 'world'
        strict.equal('hello', await future.get(scene));
    }))
});
