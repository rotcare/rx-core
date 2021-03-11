import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

describe('Reactive / object', () => {
    it(
        'set property',
        should('notify change', async (scene) => {
            const obj = reactive({ a: { b: 'hello' } }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a.b;
            });
            strict.equal('hello', await future.get(scene));
            obj.a.b = 'world';
            strict.equal('world', await future.get(scene));
        }),
    );
    it(
        'assign property',
        should('notify change', async (scene) => {
            const obj = reactive({ a: { b: 'hello' } }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a.b;
            });
            strict.equal('hello', await future.get(scene));
            Object.assign(obj.a, { b: 'world' });
            strict.equal('world', await future.get(scene));
        }),
    );
});
