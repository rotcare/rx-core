import { Future } from "./Future";
import { reactive } from "./reactive";
import { should } from "./should";
import { strict } from 'assert';

class MyClass {
    b = { c: 'hello' };
    updateSomeProp() {
        this.b.c = 'world';
    }
}

describe('Reactive / custom', () => {
    it(
        'call custom method',
        should('notify its change made internally', async (scene) => {
            const obj = reactive({ a: new MyClass() }).attachTo(scene);
            const future = new Future(async () => {
                return obj.a.b.c;
            });
            strict.equal('hello', await future.get(scene));
            obj.a.updateSomeProp();
            strict.equal('world', await future.get(scene));
        }),
    );
});
