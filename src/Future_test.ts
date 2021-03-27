import { Entity, Scene } from '@rotcare/io';
import { strict } from 'assert';
import { Future } from './Future';
import { should } from './should';

class Product extends Entity {
    public static async createProduct(scene: Scene, props: Partial<Product>) {
        return await scene.useDatabase().insert(Product, props);
    }
    public static async queryProduct(scene: Scene, props: Partial<Product>) {
        return await scene.useDatabase().query(Product, props);
    }
    public name: string;
}

describe('Future', () => {
    it(
        'Future 依赖的数据发生了变化',
        should('缓存会刷新', async (scene) => {
            await scene.create(Product, { name: 'apple' });
            const productsCount = new Future(async (scene) => {
                return (await scene.query(Product, {})).length;
            });
            strict.equal(1, await productsCount.get(scene));
            await scene.create(Product, { name: 'pear' });
            strict.equal(2, await productsCount.get(scene));
        }),
    );
    it(
        'Future 如果有监听者',
        should('获得通知', async (scene) => {
            await scene.create(Product, { name: 'apple' });
            let notified = false;
            const productsCount = new Future(
                async (scene) => {
                    return (await scene.query(Product, {})).length;
                },
                {
                    onAtomChanged() {
                        notified = true;
                    },
                },
            );
            strict.equal(1, await productsCount.get(scene));
            await scene.create(Product, { name: 'pear' });
            strict.ok(notified);
        }),
    );
});
