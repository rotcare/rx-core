import { Atom, SimpleAtom, useLog, REALM_REACTIVE } from '@stableinf/io';

const log = useLog(REALM_REACTIVE);

const mapMutatorMethods: PropertyKey[] = ['set', 'clear', 'delete'];
const mapIteratorMethods: PropertyKey[] = ['keys', 'values', 'entries', Symbol.iterator];
const setMutatorMethods: PropertyKey[] = ['add', 'clear', 'delete'];
const setIteratorMethods: PropertyKey[] = ['keys', 'values', 'entries', Symbol.iterator];

const rawValue = Symbol();
const atoms = Symbol();

export interface ChangeTracker {
    onAtomRead(atom: Atom): void;
    onAtomChanged(atom: Atom): void;
}

// 和 vue3 的 reactive 类似，根据初始值构造响应式的对象
export function reactive<T>(initData: T): T & { attachTo(changeTracker: ChangeTracker): T } {
    return new ReactiveObject(initData).attachTo(delegatesChnageTracker) as any;
}
reactive.currentChangeTracker = undefined as ChangeTracker | undefined;

// 和 vue3 的 Ref 类似，是响应式的单个值
class Ref<T = any> extends SimpleAtom {
    constructor(private value: T) {
        super();
    }

    public set(newVal: T, changeTracker?: { onAtomChanged(atom: Atom): void }) {
        this.value = newVal;
        (changeTracker || delegatesChnageTracker).onAtomChanged(this);
    }

    public get(changeTracker?: { onAtomRead(atom: Atom): void }) {
        (changeTracker || delegatesChnageTracker).onAtomRead(this);
        return this.value;
    }
}

export function ref<T>(value?: T): Ref<T> {
    return new Ref<T>(value!);
}

// @internal
export class ReactiveObject {
    private [atoms] = new Map<PropertyKey, Atom>();
    private [rawValue] = this;
    constructor(props?: Record<string, any>) {
        Object.assign(this, props);
    }
    public attachTo(tracker: ChangeTracker) {
        // 避免被 Proxy 包两遍，先把实际的原始值取出来
        const _this = this[rawValue];
        const baseHandler: ProxyHandler<any> = {
            get: (target, propertyKey, receiver) => {
                if (!_this.shouldTrack(propertyKey)) {
                    return Reflect.get(target, propertyKey);
                }
                tracker.onAtomRead(_this.atom(propertyKey));
                return _this.wrapValue(
                    tracker,
                    _this.atom(propertyKey),
                    Reflect.get(target, propertyKey),
                );
            },
            set: (target, propertyKey, value, receiver) => {
                const returnValue = Reflect.set(target, propertyKey, value, receiver);
                if (_this.shouldTrack(propertyKey)) {
                    tracker.onAtomChanged(_this.atom(propertyKey));
                } else {
                    log`proxy baseHandler ignored property set: ${propertyKey}`;
                }
                return returnValue;
            },
        };
        return new Proxy(_this, baseHandler);
    }
    private wrapValue(tracker: ChangeTracker, atom: Atom, wrappee: any): any {
        if (typeof wrappee === 'object') {
            if (wrappee instanceof ReactiveObject) {
                // 不要包两遍，Reactive 独立跟踪自己的订阅者
                return wrappee[rawValue];
            } else if (wrappee instanceof Map) {
                return new Proxy(wrappee, {
                    get: (target, propertyKey, receiver) => {
                        return this.wrapMapValue(
                            tracker,
                            atom,
                            target, // notice here is not receiver
                            propertyKey,
                            Reflect.get(target, propertyKey),
                        );
                    },
                });
            } else if (wrappee instanceof Set) {
                return new Proxy(wrappee, {
                    get: (target, propertyKey, receiver) => {
                        return this.wrapSetValue(
                            tracker,
                            atom,
                            target, // notice here is not receiver
                            propertyKey,
                            Reflect.get(target, propertyKey),
                        );
                    },
                });
            } else if (wrappee instanceof Date) {
                return wrappee;
            }
            return new Proxy(wrappee, {
                get: (target, propertyKey, receiver) => {
                    tracker.onAtomRead(atom);
                    return this.wrapValue(tracker, atom, Reflect.get(target, propertyKey));
                },
                set: (target, propertyKey, value, receiver) => {
                    const returnValue = Reflect.set(target, propertyKey, value, receiver);
                    tracker.onAtomChanged(atom);
                    return returnValue;
                },
            });
        }
        return wrappee;
    }
    private wrapMapValue(
        tracker: ChangeTracker,
        atom: Atom,
        parent: any,
        parentKey: PropertyKey,
        wrappee: any,
    ) {
        if (mapMutatorMethods.includes(parentKey)) {
            tracker.onAtomChanged(atom);
            return wrappee.bind(parent);
        }
        if (mapIteratorMethods.includes(parentKey)) {
            const isPair = parentKey === 'entries' || parentKey === Symbol.iterator;
            return this.wrapIteratorMethod(tracker, atom, parent, wrappee, isPair);
        }
        if (typeof wrappee === 'function') {
            return (...args: any[]) => {
                return this.wrapValue(tracker, atom, wrappee.apply(parent, args));
            };
        }
        return wrappee;
    }
    private wrapSetValue(
        tracker: ChangeTracker,
        atom: Atom,
        parent: any,
        parentKey: PropertyKey,
        wrappee: any,
    ) {
        if (setMutatorMethods.includes(parentKey)) {
            tracker.onAtomChanged(atom);
            return wrappee.bind(parent);
        }
        if (setIteratorMethods.includes(parentKey)) {
            const isPair = parentKey === 'entries';
            return this.wrapIteratorMethod(tracker, atom, parent, wrappee, isPair);
        }
        if (typeof wrappee === 'function') {
            return (...args: any[]) => {
                return this.wrapValue(tracker, atom, wrappee.apply(parent, args));
            };
        }
        return wrappee;
    }
    private wrapIteratorMethod(
        tracker: ChangeTracker,
        atom: Atom,
        parent: any,
        wrappee: any,
        isPair: boolean,
    ) {
        const wrap = this.wrapValue.bind(this, tracker, atom);
        return () => {
            const innerIterator = wrappee.call(parent);
            return {
                // iterator protocol
                next() {
                    const { value, done } = innerIterator.next();
                    return done
                        ? { value, done }
                        : {
                              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                              done,
                          };
                },
                // iterable protocol
                [Symbol.iterator]() {
                    return this;
                },
            };
        };
    }
    private atom(propertyKey: PropertyKey) {
        let atom = this[atoms].get(propertyKey);
        if (!atom) {
            this[atoms].set(propertyKey, (atom = new ReactiveProp(propertyKey)));
        }
        return atom;
    }
    protected shouldTrack(propertyKey: PropertyKey) {
        if (propertyKey === rawValue || propertyKey === 'attachTo') {
            return false;
        }
        return true;
    }
}

const delegatesChnageTracker: ChangeTracker = {
    onAtomRead(atom) {
        if (!reactive.currentChangeTracker) {
            throw new Error(
                'reactive.currentChangeTracker is undefined, can not read from reactive',
            );
        }
        return reactive.currentChangeTracker.onAtomRead(atom);
    },
    onAtomChanged(atom) {
        throw new Error('reactive() can not be modified before attachTo a change tracker');
    },
};

class ReactiveProp extends SimpleAtom {
    constructor(public readonly propertyKey: PropertyKey) {
        super();
    }
    public get [Symbol.toStringTag]() {
        return `[ReactiveProp]${this.propertyKey.toString()}`;
    }
}
