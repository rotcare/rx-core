import type { Atom, Span, Scene, AtomSubscriber } from '@stableinf/io';

// Future 是一个 async 计算流程，通过 scene 访问 I/O，从而对所访问的 table 进行订阅
export class Future<T = any> {
    private subscriptions = new Set<Atom>();
    private loading?: Promise<any>;
    private cache: any;

    constructor(
        private readonly compute: (scene: Scene) => Promise<T>,
        private readonly observer?: AtomSubscriber,
    ) {}

    public async get(scene: Scene): Promise<T> {
        if (this.cache !== undefined) {
            this.copySubscriptions(scene);
            return this.cache;
        }
        if (this.loading) {
            const result = await this.awaitLoading(this.loading);
            this.copySubscriptions(scene);
            return result;
        }
        return await scene.trackAtomRead(this, async () => {
            this.loading = this.compute(scene);
            try {
                return await this.awaitLoading(this.loading);
            } finally {
                this.loading = undefined;
            }
        });
    }

    private copySubscriptions(scene: Scene) {
        for (const atom of this.subscriptions) {
            scene.onAtomRead(atom);
        }
    }

    private async awaitLoading(existingPromise: Promise<any>) {
        const result = await existingPromise;
        if (this.loading === existingPromise) {
            this.cache = result;
        } else {
            this.dispose();
        }
        return result;
    }

    // 数据变化了，需要重新计算
    public onAtomChanged(span: Span) {
        this.subscriptions.clear();
        this.cache = undefined;
        if (this.observer) {
            this.observer.onAtomChanged(span);
        }
    }

    public onAtomRead(atom: Atom) {
        this.subscriptions.add(atom);
        atom.addSubscriber(this);
    }

    public dispose() {
        for (const subscription of this.subscriptions) {
            subscription.deleteSubscriber(this);
        }
        this.subscriptions.clear();
        this.cache = undefined;
        this.loading = undefined;
    }
}
