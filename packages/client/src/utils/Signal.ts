import { pOnce, pOne } from './index'
import AggregatedError from './AggregatedError'

type SignalListener<T> = (t: T) => void | Promise<void>
type SignalListenerWrap<T> = SignalListener<T> & {
    listener: SignalListener<T>
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
    /**
     *  Create a Signal's listen function with signal utility methods attached.
     *  See example above.
     */
    static create<ValueType, ReturnType>(returnValue: ReturnType, once?: boolean) {
        const signal = new Signal<ValueType>(once)
        return Object.assign((cb: SignalListener<ValueType>) => {
            signal.listen(cb)
            return returnValue
        }, {
            triggerCount() {
                return signal.triggerCount
            },
            once: signal.once.bind(signal),
            trigger: signal.trigger,
            unlisten: signal.unlisten.bind(signal),
            listen: signal.listen.bind(signal),
            unlistenAll: signal.unlistenAll.bind(signal),
            end: signal.end,
        })
    }

    /**
     * Will only trigger once.
     * Adding listeners after already fired will fire listener immediately.
     * Calling trigger after already triggered is a noop.
     */
    static once<ValueType, ReturnType>(returnValue: ReturnType) {
        return this.create<ValueType, ReturnType>(returnValue, true)
    }

    listeners: (SignalListener<ValueType> | SignalListenerWrap<ValueType>)[] = []
    isEnded = false
    lastValue?: ValueType
    triggerCount = 0

    constructor(private isOnce = false) {
        if (isOnce) {
            this.trigger = pOnce(this.trigger)
        }
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
     * Attach a callback listener to this Signal.
     */
    listen(cb: SignalListener<ValueType>) {
        if (this.isEnded) {
            // wait for any outstanding, ended so can't re-trigger
            // eslint-disable-next-line promise/no-callback-in-promise
            this.trigger(this.lastValue!).then(() => cb(this.lastValue!)).catch(() => {})
            return this
        }

        this.listeners.push(cb)
        return this
    }

    once(cb: SignalListener<ValueType>) {
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
    trigger = pOne(async (
        // TS nonsense to allow trigger() when ValueType is undefined/void
        ...args: [ValueType] extends [undefined] ? any[] : [ValueType]
    ): Promise<void> => {
        const [value] = args
        if (this.isEnded) {
            return
        }

        this.triggerCount += 1

        this.lastValue = value
        const tasks = this.listeners.slice()
        if (this.isOnce) {
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
    })
}
