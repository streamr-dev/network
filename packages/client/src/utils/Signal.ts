import { pOnce, pOne } from './index'
import AggregatedError from './AggregatedError'

type SignalListener<T> = (t: T) => void | Promise<void>

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
export default class Signal<T> {
    /**
     *  Create a Signal's listen function with signal utility methods attached.
     *  See example above.
     */
    static create<T, U>(returnValue: U, once?: boolean) {
        const signal = new Signal<T>(once)
        return Object.assign((cb: SignalListener<T | undefined>) => {
            signal.listen(cb)
            return returnValue
        }, {
            get triggerCount() {
                return signal.triggerCount
            },
            trigger: signal.trigger.bind(signal),
            unlisten: signal.unlisten.bind(signal),
            listen: signal.listen.bind(signal),
            unlistenAll: signal.unlistenAll.bind(signal),
            end: signal.end.bind(signal),
        })
    }

    /**
     * Will only trigger once.
     * Adding listeners after already fired will fire listener immediately.
     * Calling trigger after already triggered is a noop.
     */
    static once<T, U>(returnValue: U) {
        return this.create<T, U>(returnValue, true)
    }

    listeners: SignalListener<T | undefined>[] = []
    isEnded = false
    lastValue: T | undefined
    triggerCount = 0

    constructor(private once = false) {
        if (once) {
            this.trigger = pOnce(this.trigger.bind(this))
        } else {
            this.trigger = pOne(this.trigger.bind(this))
        }
    }

    /**
     * No more events.
     */
    end() {
        this.isEnded = true
        this.listeners.length = 0
    }

    /**
     * Attach a callback listener to this Signal.
     */
    listen(cb: SignalListener<T | undefined>) {
        if (this.isEnded) {
            // eslint-disable-next-line promise/no-callback-in-promise
            this.trigger().then(() => cb(this.lastValue)).catch(() => {})
            return this
        }

        this.listeners.push(cb)
        return this
    }

    /**
     * Remove a callback listener from this Signal.
     */
    unlisten(cb: SignalListener<T | undefined>) {
        if (this.isEnded) {
            return this
        }

        this.listeners.splice(this.listeners.indexOf(cb), 1)
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
    async trigger(value?: T): Promise<void> {
        if (this.isEnded) {
            return
        }

        this.triggerCount += 1

        this.lastValue = value
        const tasks = this.listeners.slice()
        if (this.once) {
            this.end()
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
