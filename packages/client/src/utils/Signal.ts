import { pOnce, pLimitFn, pOne } from './index'
import AggregatedError from './AggregatedError'

type SignalListener<T> = (t: T) => (unknown | Promise<unknown>)
type SignalListenerWrap<T> = SignalListener<T> & {
    listener: SignalListener<T>
}

export enum TRIGGER_TYPE {
  ONCE = 'ONCE',
  ONE = 'ONE',
  QUEUE = 'QUEUE',
  PARALLEL = 'PARALLEL',
}
/**
 * Like an event emitter, but for a single event.  Listeners are executed
 * in-order, in an async sequence.  Any errors in listerns errors will be
 * thrown by trigger() as an AggregateError at end.
 *
 * Allows attaching onEvent properties to classes e.g.
 * ```ts
 * class Messages {
 *     onMessage = Signal.create<Message>(this)
 *     async push(msg: Message) {
 *         await this.onMessage.trigger(msg)
 *     }
 * }
 *
 * const msgs = new Messages()
 * msgs.onMessage((msg) => console.log(msg))
 * await msgs.push(new Message())
 * ```
 */
export default class Signal<ValueType = void> {
    static TRIGGER_TYPE = TRIGGER_TYPE
    /**
     *  Create a Signal's listen function with signal utility methods attached.
     *  See example above.
     */
    static create<ValueType = void>(triggerType: TRIGGER_TYPE = TRIGGER_TYPE.PARALLEL) {
        const signal = new Signal<ValueType>(triggerType)
        function listen(): Promise<ValueType>
        function listen<ReturnType>(this: ReturnType, cb: SignalListener<ValueType>): ReturnType
        function listen<ReturnType>(this: ReturnType, cb?: SignalListener<ValueType>) {
            if (!cb) {
                return signal.listen()
            }

            signal.listen(cb)
            return this
        }

        return Object.assign(listen, {
            triggerCount: signal.triggerCount.bind(signal),
            once: signal.once.bind(signal),
            wait: signal.wait.bind(signal),
            trigger: signal.trigger,
            unlisten: signal.unlisten.bind(signal),
            listen: signal.listen.bind(signal),
            unlistenAll: signal.unlistenAll.bind(signal),
            countListeners: signal.countListeners.bind(signal),
            end: signal.end,
            [Symbol.asyncIterator]: signal[Symbol.asyncIterator].bind(signal)
        })
    }

    /**
     * Will only trigger once.  Adding listeners after already fired will fire
     * listener immediately.  Calling trigger after already triggered is a
     * noop.
     */
    static once<ValueType = void>() {
        return this.create<ValueType>(TRIGGER_TYPE.ONCE)
    }

    /**
     * Only one pending trigger call at a time.  Calling trigger again while
     * listeners are pending will not trigger listeners again, and will resolve
     * when listeners are resolved.
     */
    static one<ValueType = void>() {
        return this.create<ValueType>(TRIGGER_TYPE.ONE)
    }

    /**
     * Only one pending trigger call at a time, but calling trigger again while
     * listeners are pending will enqueue the trigger until after listeners are
     * resolved.
     */
    static queue<ValueType = void>() {
        return this.create<ValueType>(TRIGGER_TYPE.QUEUE)
    }

    /**
     * Trigger does not wait for pending trigger calls at all.
     * Listener functions are still executed in async series,
     * but multiple triggers can be active in parallel.
     */
    static parallel<ValueType = void>() {
        return this.create<ValueType>(TRIGGER_TYPE.PARALLEL)
    }

    listeners: (SignalListener<ValueType> | SignalListenerWrap<ValueType>)[] = []
    isEnded = false
    lastValue?: ValueType
    triggerCountValue = 0

    constructor(private triggerType: TRIGGER_TYPE = TRIGGER_TYPE.PARALLEL) {
        switch (triggerType) {
            case TRIGGER_TYPE.ONCE: {
                this.trigger = pOnce(this.trigger)
                break
            }
            case TRIGGER_TYPE.QUEUE: {
                this.trigger = pLimitFn(this.trigger)
                break
            }
            case TRIGGER_TYPE.ONE: {
                this.trigger = pOne(this.trigger)
                break
            }
            case TRIGGER_TYPE.PARALLEL: {
                // no special handling
                break
            }
            default: {
                throw new Error(`unknown trigger type: ${triggerType}`)
            }
        }
    }

    triggerCount() {
        return this.triggerCountValue
    }

    /**
     * No more events.
     */
    end = (...args: [ValueType] extends [undefined] ? any[] : [ValueType]) => {
        const [value] = args
        this.lastValue = value
        this.isEnded = true
        this.listeners.length = 0
    }

    /**
     * Promise that resolves on next trigger.
     */
    wait(): Promise<ValueType> {
        return new Promise((resolve) => {
            this.once(resolve)
        })
    }

    /**
     * Attach a callback listener to this Signal.
     */
    listen(): Promise<ValueType>
    listen(cb: SignalListener<ValueType>): Signal<ValueType>
    listen(cb?: SignalListener<ValueType>): Signal<ValueType> | Promise<ValueType> {
        if (!cb) {
            if (this.isEnded) {
                return this.trigger(this.lastValue!).then(() => {
                    return this.lastValue!
                })
            }

            return new Promise((resolve) => {
                this.once(resolve)
            })
        }

        if (this.isEnded) {
            // wait for any outstanding, ended so can't re-trigger
            // eslint-disable-next-line promise/no-callback-in-promise
            this.trigger(this.lastValue!).then(() => cb(this.lastValue!)).catch(() => {})
            return this
        }

        this.listeners.push(cb)
        return this
    }

    countListeners() {
        return this.listeners.length
    }

    once(): Promise<ValueType>
    once(cb: SignalListener<ValueType>): this
    once(cb?: SignalListener<ValueType>): this | Promise<ValueType> {
        if (!cb) {
            return this.listen()
        }

        if (this.isEnded) {
            // wait for any outstanding, ended so can't re-trigger
            // eslint-disable-next-line promise/no-callback-in-promise
            this.trigger(this.lastValue!).then(() => cb(this.lastValue!)).catch(() => {})
            return this
        }

        const wrappedListener: SignalListenerWrap<ValueType> = Object.assign((v: ValueType) => {
            this.unlisten(cb)
            return cb(v)
        }, {
            listener: cb
        })

        this.listeners.push(wrappedListener)
        return this
    }

    async* [Symbol.asyncIterator]() {
        while (!this.isEnded) {
            // eslint-disable-next-line no-await-in-loop
            yield await this.listen()
        }
    }

    /**
     * Remove a callback listener from this Signal.
     */
    unlisten(cb: SignalListener<ValueType>) {
        if (this.isEnded) {
            return this
        }
        const index = this.listeners.findIndex((listener) => {
            return listener === cb || ('listener' in listener && listener.listener === cb)
        })
        this.listeners.splice(index, 1)
        return this
    }

    /**
     * Remove all callback listeners from this Signal.
     */
    unlistenAll() {
        this.listeners.length = 0
    }

    /**
     * Trigger the signal with optional value, like emitter.emit.
     */
    trigger = async (
        // TS nonsense to allow trigger() when ValueType is undefined/void
        ...args: [ValueType] extends [undefined] ? any[] : [ValueType]
    ): Promise<void> => {
        const [value] = args
        if (this.isEnded) {
            return
        }

        this.triggerCountValue += 1

        this.lastValue = value
        const tasks = this.listeners.slice()
        if (this.triggerType === TRIGGER_TYPE.ONCE) {
            // removes all listeners
            this.end(this.lastValue!)
        }

        if (!tasks.length) { return }
        let error: Error | undefined
        await tasks.reduce(async (prev, task) => {
            return prev.then(async () => {
                // eslint-disable-next-line promise/always-return
                try {
                    await task(value)
                } catch (err) {
                    error = AggregatedError.from(error, err)
                }
            })
        }, Promise.resolve())

        if (error) {
            throw error
        }
    }
}
