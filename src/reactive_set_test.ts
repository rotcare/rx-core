import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

describe('Reactive / set', () => {
    it(
        'add member',
        should('notify change', async (scene) => {
            const obj = reactive({ a: new Set() }).attachTo(scene);
            const future = new Future(async () => {
                return Array.from(obj.a).join(',');
            });
            strict.equal('', await future.get(scene));
            obj.a.add('hello');
            strict.equal('hello', await future.get(scene));
        }),
    );
    it(
        'mutate object hold by set',
        should('notify change', async (scene) => {
            const innerObj = {'b': 'hello'};
            const obj = reactive({ a: new Set([innerObj]) }).attachTo(scene);
            const innerProxy = Array.from(obj.a)[0];
            const future = new Future(async () => {
                return innerProxy['b'];
            });
            strict.equal('hello', await future.get(scene));
            innerProxy['b'] = 'world';
            strict.equal('world', await future.get(scene));
        }),
    );
});
