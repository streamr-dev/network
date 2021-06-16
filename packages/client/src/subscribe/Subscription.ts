import Emitter from 'events'

import { AggregatedError, Defer, counterId } from '../utils'
import { validateOptions } from '../stream/utils'

import MessagePipeline from './pipeline'
import Validator from './Validator'
import { Todo, MaybeAsync } from '../types'
import StreamrClient from '..'

async function defaultOnFinally(err?: Error) {
    if (err) {
        throw err
    }
}

/**
 * @category Important
 */
export default class Subscription extends Emitter {

    streamId: string
    streamPartition: number
    /** @internal */
    client: StreamrClient
    /** @internal */
    options: ReturnType<typeof validateOptions> & {
        id?: string
    }
    /** @internal */
    key
    /** @internal */
    id
    /** @internal */
    _onDone: ReturnType<typeof Defer>
    /** @internal */
    _onFinally
    /** @internal */
    pipeline: ReturnType<typeof MessagePipeline>
    /** @internal */
    msgStream
    /** @internal */
    iterated = false
    /** @internal */
    debug

    constructor(client: StreamrClient, opts: Todo, onFinally: MaybeAsync<(err?: any) => void> = defaultOnFinally) {
        super()
        this.client = client
        this.options = validateOptions(opts)
        this.key = this.options.key
        this.id = counterId(`Subscription:${this.options.id || ''}${this.key}`)
        this.debug = client.debug.extend(this.id)
        this.debug('create')
        this.streamId = this.options.streamId
        this.streamPartition = this.options.streamPartition

        this._onDone = Defer()
        this._onDone.catch(() => {}) // prevent unhandledrejection
        this._onFinally = onFinally

        const validate = opts.validate || Validator(client, this.options)
        this.onPipelineEnd = this.onPipelineEnd.bind(this)
        this.pipeline = opts.pipeline || MessagePipeline(client, {
            ...this.options,
            validate,
            onError: (err: Error) => {
                this.emit('error', err)
            },
        }, this.onPipelineEnd)

        this.msgStream = this.pipeline.msgStream
    }

    emit(event: symbol | string, ...args: any[]) {
        if (event !== 'error') {
            return super.emit(event, ...args)
        }
        const [error] = args

        if (!this.listenerCount('error')) {
            this.debug('emitting error but no error listeners, cancelling subscription', error)
            this.cancel(error)
            return false
        }

        try {
            this.debug('emit error', error)
            return super.emit('error', ...args)
        } catch (err) {
            if (err !== error) {
                this.debug('error emitting error!', err)
            }
            this.cancel(err)
            return false
        }
    }

    /**
     * Expose cleanup
     * @internal
     */

    public async onPipelineEnd(err?: Error) {
        this.debug('onPipelineEnd', err)
        let error = err
        this.pipeline = undefined
        try {
            const onFinally = this._onFinally
            this._onFinally = () => {}
            await onFinally(error)
        } catch (onFinallyError) {
            error = AggregatedError.from(error, onFinallyError)
        } finally {
            this._onDone.handleErrBack(error)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    count(): number {
        // will be overridden by subscriptions
        return 1
    }

    /** @internal */
    async onDone() {
        return this._onDone
    }

    /**
     * Collect all messages into an array.
     * Returns array when subscription is ended.
     */
    async collect(n?: number) {
        const msgs = []
        for await (const msg of this) {
            if (n === 0) {
                break
            }

            msgs.push(msg.getParsedContent())
            if (msgs.length === n) {
                break
            }
        }

        return msgs
    }

    [Symbol.asyncIterator]() {
        // only iterate sub once
        if (this.iterated) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }

        this.iterated = true
        return this.pipeline
    }

    async cancel(...args: Todo[]) {
        return this.pipeline?.cancel(...args)
    }

    isCancelled(...args: Todo[]): boolean {
        if (!this.pipeline) { return false }
        return this.pipeline.isCancelled(...args)
    }

    async return(...args: Todo[]) {
        return this.pipeline?.return(...args)
    }

    async throw(...args: Todo[]) {
        return this.pipeline?.throw(...args)
    }

    /**
     * Remove this subscription from the stream.
     */
    async unsubscribe() {
        return this.cancel()
    }
}
