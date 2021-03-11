import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

describe('Reactive / array', () => {
    it(
        'push element',
        should('notify change', async (scene) => {
            const obj = reactive({ a: ['first'] }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a.length;
            });
            strict.equal(1, await future.get(scene));
            obj.a.push('second');
            strict.equal(2, await future.get(scene));
        }),
    );
    it(
        'iterate',
        should('still work', async (scene) => {
            const obj = reactive({ a: [1, 2, 3] }).attachTo(scene);
            let total = 0;
            for (const elem of obj.a) {
                total += elem;
            }
            strict.equal(6, total);
        }),
    );
    it(
        'reset length',
        should('notify change', async (scene) => {
            const obj = reactive({ a: ['first', 'second'] }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a[0];
            });
            strict.equal('first', await future.get(scene));
            obj.a.length = 0;
            strict.equal(undefined, await future.get(scene));
        }),
    );
});
