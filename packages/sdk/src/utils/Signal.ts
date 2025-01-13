import { pOnce, pLimitFn, pOne } from './promises'

export type SignalListener<T extends any[]> = (...args: T) => unknown | Promise<unknown>
type SignalListenerWrap<T extends any[]> = SignalListener<T> & {
    listener: SignalListener<T>
}

export enum TRIGGER_TYPE {
    ONCE = 'ONCE',
    ONE = 'ONE',
    QUEUE = 'QUEUE',
    PARALLEL = 'PARALLEL'
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

export class Signal<ArgsType extends any[] = []> {
    static TRIGGER_TYPE = TRIGGER_TYPE
    /**
     *  Create a Signal's listen function with signal utility methods attached.
     *  See example above.
     */
    static create<ArgsType extends any[] = []>(triggerType: TRIGGER_TYPE = TRIGGER_TYPE.PARALLEL): Signal<ArgsType> {
        return new this<ArgsType>(triggerType)
    }

    /**
     * Will only trigger once.  Adding listeners after already fired will fire
     * listener immediately.  Calling trigger after already triggered is a
     * noop.
     */
    static once<ArgsType extends any[] = []>(): Signal<ArgsType> {
        return this.create<ArgsType>(TRIGGER_TYPE.ONCE)
    }

    /**
     * Only one pending trigger call at a time.  Calling trigger again while
     * listeners are pending will not trigger listeners again, and will resolve
     * when listeners are resolved.
     */
    static one<ArgsType extends any[] = []>(): Signal<ArgsType> {
        return this.create<ArgsType>(TRIGGER_TYPE.ONE)
    }

    /**
     * Only one pending trigger call at a time, but calling trigger again while
     * listeners are pending will enqueue the trigger until after listeners are
     * resolved.
     */
    static queue<ArgsType extends any[] = []>(): Signal<ArgsType> {
        return this.create<ArgsType>(TRIGGER_TYPE.QUEUE)
    }

    /**
     * Trigger does not wait for pending trigger calls at all.
     * Listener functions are still executed in async series,
     * but multiple triggers can be active in parallel.
     */
    static parallel<ArgsType extends any[] = []>(): Signal<ArgsType> {
        return this.create<ArgsType>(TRIGGER_TYPE.PARALLEL)
    }

    protected listeners: (SignalListener<ArgsType> | SignalListenerWrap<ArgsType>)[] = []
    protected isEnded = false
    protected triggerCountValue = 0
    protected triggerType: TRIGGER_TYPE

    constructor(triggerType: TRIGGER_TYPE = TRIGGER_TYPE.PARALLEL) {
        this.triggerType = triggerType
        this.trigger = Function.prototype.bind.call(this.trigger, this)
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

    triggerCount(): number {
        return this.triggerCountValue
    }

    lastValue: ArgsType | undefined

    /**
     * No more events.
     */
    end = (...args: ArgsType): void => {
        this.lastValue = args
        this.isEnded = true
    }

    /**
     * Promise that resolves on next trigger.
     */
    wait(): Promise<ArgsType[0]> {
        return new Promise((resolve) => {
            this.once((...args) => resolve(args[0]))
        })
    }

    async getLastValue(): Promise<ArgsType> {
        if (this.currentTask) {
            await this.currentTask
        }

        if (!this.lastValue) {
            throw new Error('Signal ended with no value')
        }

        return this.lastValue
    }

    /**
     * Attach a callback listener to this Signal.
     */
    listen(): Promise<ArgsType[0]>
    listen(cb: SignalListener<ArgsType>): this
    listen(cb?: SignalListener<ArgsType>): this | Promise<ArgsType[0]> {
        if (!cb) {
            return new Promise((resolve) => {
                this.once((...args) => {
                    resolve(args[0])
                })
            })
        }

        if (this.isEnded) {
            // wait for any outstanding, ended so can't re-trigger
            this.getLastValue()
                .then((args) => cb(...args))
                .catch(() => {})
            return this
        }

        this.listeners.push(cb)
        return this
    }

    once(): Promise<ArgsType[0]>
    once(cb: SignalListener<ArgsType>): this
    once(cb?: SignalListener<ArgsType>): this | Promise<ArgsType[0]> {
        if (!cb) {
            return this.listen()
        }

        const wrappedListener: SignalListenerWrap<ArgsType> = Object.assign(
            (...args: ArgsType) => {
                this.unlisten(cb)
                return cb(...args)
            },
            {
                listener: cb
            }
        )

        return this.listen(wrappedListener)
    }

    countListeners(): number {
        return this.listeners.length
    }

    /**
     * Remove a callback listener from this Signal.
     */
    unlisten(cb: SignalListener<ArgsType>): this {
        const index = this.listeners.findIndex((listener) => {
            return listener === cb || ('listener' in listener && listener.listener === cb)
        })
        this.listeners.splice(index, 1)
        return this
    }

    protected async execTrigger(...args: ArgsType): Promise<void> {
        if (this.isEnded) {
            return
        }

        this.triggerCountValue += 1

        // capture listeners
        const tasks = this.listeners.slice()
        if (this.triggerType === TRIGGER_TYPE.ONCE) {
            // remove all listeners
            this.listeners = []
            this.end(...args)
        }

        if (!tasks.length) {
            return
        }

        // execute tasks in sequence
        await tasks.reduce(async (prev, task) => {
            await prev
            await task(...args)
        }, Promise.resolve())
    }

    currentTask: Promise<void> | undefined

    /**
     * Trigger the signal with optional value, like emitter.emit.
     */
    async trigger(...args: ArgsType): Promise<void> {
        const task = this.execTrigger(...args)
        this.currentTask = task
        try {
            await this.currentTask
        } finally {
            if (this.currentTask === task) {
                this.currentTask = undefined
            }
        }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<Awaited<ArgsType[0]>, void, unknown> {
        while (!this.isEnded) {
            yield await this.listen()
        }
    }
}

/**
 * Special Signal for Errors.
 * Trigger this Signal to decide whether to suppress or throw err.
 * Suppress error if listeners don't rethrow
 * Throws on trigger if no listeners.
 * Won't trigger listeners for same Error instance more than once.
 */
export class ErrorSignal<ArgsType extends [Error] = [Error]> extends Signal<ArgsType> {
    protected seenErrors = new WeakSet<Error>()
    protected ignoredErrors = new WeakSet<Error>()
    private minListeners = 1

    protected override async execTrigger(...args: ArgsType): Promise<void> {
        if (this.isEnded) {
            return
        }

        this.triggerCountValue += 1

        // capture listeners
        const tasks = this.listeners.slice()
        if (this.triggerType === TRIGGER_TYPE.ONCE) {
            // remove all listeners
            this.listeners = []
            this.end(...args)
        }

        if (!tasks.length) {
            return
        }

        // execute tasks in sequence
        await tasks.reduce(async (prev, task) => {
            // pass previous error to next
            try {
                await prev
            } catch (err) {
                // @ts-expect-error type mismatch in err parameter
                await task(err)
                return
            }

            await task(...args)
        }, Promise.resolve())
    }

    override async trigger(...args: ArgsType): Promise<void> {
        const err = args[0]
        // don't double-handle errors
        if (this.ignoredErrors.has(err)) {
            return
        }

        if (this.seenErrors.has(err)) {
            // if we've seen this error, just throw
            throw err
        }

        this.seenErrors.add(err)

        const hadMinListeners = !!(this.countListeners() >= this.minListeners)
        try {
            await super.trigger(...args)
            // rethrow if no listeners
            if (!hadMinListeners) {
                throw err
            }

            // suppress error
            this.ignoredErrors.add(err)
        } catch (nextErr) {
            // don't double handle if different error thrown
            // by onError trigger
            this.seenErrors.add(nextErr)
            throw nextErr
        }
    }
}
