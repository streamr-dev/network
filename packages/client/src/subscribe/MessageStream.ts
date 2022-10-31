/**
 * Wrapper around PushPipeline specific to StreamMessages.
 * Subscriptions are MessageStreams.
 * Not all MessageStreams are Subscriptions.
 */
import { Pipeline, PipelineTransform } from '../utils/Pipeline'
import { PushPipeline } from '../utils/PushPipeline'
import { StreamMessage } from 'streamr-client-protocol'
import * as G from '../utils/GeneratorUtils'

export type MessageStreamOnMessage<T, R = unknown> = (msg: T, streamMessage: StreamMessage<T>) => R | Promise<R>

export class MessageStream<T = unknown> implements AsyncIterable<StreamMessage<T>> {

    private pipeline: PushPipeline<StreamMessage<T>, StreamMessage<T>> = new PushPipeline()

    /** @internal */
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor() {
    }

    /**
     * Attach a legacy onMessage handler and consume if necessary.
     * onMessage is passed parsed content as first arument, and streamMessage as second argument.
     * @internal
     */
    useLegacyOnMessageHandler(onMessage?: MessageStreamOnMessage<T>): this {
        if (onMessage) {
            this.pipeline.onMessage.listen(async (streamMessage) => {
                if (streamMessage instanceof StreamMessage) {
                    await onMessage(streamMessage.getParsedContent(), streamMessage)
                }
            })
        }
        this.pipeline.flow()

        return this
    }

    /** @internal */
    async collectContent(n?: number): Promise<any[]> {
        const messages = await this.collect(n)
        return messages.map((streamMessage) => {
            if (streamMessage instanceof StreamMessage) {
                return streamMessage.getParsedContent()
            }
            return streamMessage
        })
    }

    // TODO we could remove this methods and use collect() utility
    // method instead (in iterators.ts)
    /** @internal */
    async collect(n?: number): Promise<StreamMessage<T>[]> {
        return this.pipeline.collect(n)
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage<T>> {
        return this.pipeline[Symbol.asyncIterator]()
    }

    /*
     * The methods below are used to control or observe the pipeline.
     * TODO We should refactor the pipeline handling so that a MessageStream producer
     * (e.g. SubscriptionSession or Resends) creates a PushPipeline (or similar) data structure,
     * and calls these methods for that pipeline. Here in MessageStream we'd see the object
     * as Pipeline interface. Ideally here in MessageStream we'd use the pipeline only to get
     * an async iterator when [Symbol.asyncIterator]() is called for this MessageStream.
     * When the we have done the refactoring, all/most other methods below could be removed.
     */

    /** @internal */
    onFinally = this.pipeline.onFinally

    /** @internal */
    onBeforeFinally = this.pipeline.onBeforeFinally

    /** @internal */
    onError = this.pipeline.onError

    /** @internal */
    onMessage = this.pipeline.onMessage

    /** @internal */
    flow(): void {
        this.pipeline.flow()
    }

    /** @internal */
    async push(item: StreamMessage<T>): Promise<void> {
        await this.pipeline.push(item)
    }

    /** @internal */
    pipe<NewOutType>(fn: PipelineTransform<StreamMessage<T>, NewOutType>): Pipeline<StreamMessage<T>, NewOutType> {
        return this.pipeline.pipe(fn)
    }

    // used only in tests
    /** @internal */
    pipeBefore(fn: PipelineTransform<StreamMessage<T>, StreamMessage<T>>): Pipeline<StreamMessage<T>, StreamMessage<T>> {
        return this.pipeline.pipeBefore(fn)
    }

    /** @internal */
    map<NewOutType>(fn: G.GeneratorMap<StreamMessage<T>, NewOutType>): Pipeline<StreamMessage<T>, NewOutType> {
        return this.pipeline.map(fn)
    }

    /** @internal */
    forEach(fn: G.GeneratorForEach<StreamMessage<T>>): Pipeline<StreamMessage<T>, StreamMessage<T>> {
        return this.pipeline.forEach(fn)
    }

    // used only in tests
    /** @internal */
    async consume(fn?: (streamMessage: StreamMessage<T>) => void): Promise<void> {
        await this.pipeline.consume(fn)
    }

    /** @internal */
    async pull(source: AsyncGenerator<StreamMessage<T>>): Promise<void> {
        return this.pipeline.pull(source)
    }

    /** @internal */
    async handleError(err: Error): Promise<void> {
        await this.pipeline.handleError(err)
    }

    /** @internal */
    end(err?: Error): void {
        this.pipeline.end(err)
    }

    /** @internal */
    endWrite(err?: Error): void {
        this.pipeline.endWrite(err)
    }

    /** @internal */
    isDone(): boolean {
        return this.pipeline.isDone()
    }

    /** @internal */
    return(): Promise<unknown> {
        return this.pipeline.return()
    }

    // used only in tests
    /** @internal */
    throw(err: Error): Promise<unknown> {
        return this.pipeline.throw(err)
    }
}
