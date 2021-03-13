import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

describe('Reactive / map', () => {
    it(
        'set key',
        should('notify change', async (scene) => {
            const obj = reactive({ a: new Map() }).attachTo(scene);
            const future = new Future(async () => {
                return Array.from(obj.a.values()).join(',');
            });
            strict.equal('', await future.get(scene));
            obj.a.set('k1', 'v1');
            strict.equal('v1', await future.get(scene));
        }),
    );
    it(
        'mutate array hold by map',
        should('notify change', async (scene) => {
            const arr = ['hello'];
            const obj = reactive({ a: new Map([['b', arr]]) }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a.get('b')!.join(',');
            });
            strict.equal('hello', await future.get(scene));
            obj.a.get('b')!.push('world');
            strict.equal('hello,world', await future.get(scene));
        }),
    );
});
