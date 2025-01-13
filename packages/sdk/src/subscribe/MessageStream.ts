/**
 * Wrapper around PushPipeline specific to StreamMessages.
 * Subscriptions are MessageStreams.
 * Not all MessageStreams are Subscriptions.
 */
import omit from 'lodash/omit'
import { StreamMessage } from '../protocol/StreamMessage'
import { Pipeline, PipelineTransform } from '../utils/Pipeline'
import { PushPipeline } from '../utils/PushPipeline'
import { Signal } from '../utils/Signal'
import { Message, MessageMetadata, convertStreamMessageToMessage } from './../Message'

export type MessageListener = (content: unknown, metadata: MessageMetadata) => unknown | Promise<unknown>

/**
 * Provides asynchronous iteration with
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of | for await .. of}.
 */
export class MessageStream implements AsyncIterable<Message> {
    private readonly pipeline: PushPipeline<StreamMessage, StreamMessage>
    /** @internal */
    onFinally: Signal<[Error | undefined]>
    /** @internal */
    onBeforeFinally: Signal<[]>
    /** @internal */
    onError: Signal<[Error, (StreamMessage | undefined)?]>

    /** @internal */
    constructor(pipeline?: PushPipeline<StreamMessage, StreamMessage>) {
        this.pipeline = pipeline ?? new PushPipeline()
        this.onFinally = this.pipeline.onFinally
        this.onBeforeFinally = this.pipeline.onBeforeFinally
        this.onError = this.pipeline.onError
    }

    /**
     * Attach a legacy onMessage handler and consume if necessary.
     * onMessage is passed parsed content as first arument, and streamMessage as second argument.
     * @internal
     */
    useLegacyOnMessageHandler(onMessage: MessageListener): this {
        this.pipeline.onMessage.listen(async (streamMessage) => {
            const msg = convertStreamMessageToMessage(streamMessage)
            await onMessage(msg.content, omit(msg, 'content'))
        })
        this.pipeline.flow()

        return this
    }

    async *[Symbol.asyncIterator](): AsyncIterator<Message> {
        for await (const msg of this.pipeline) {
            yield convertStreamMessageToMessage(msg)
        }
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
    async push(item: StreamMessage): Promise<void> {
        await this.pipeline.push(item)
    }

    /** @internal */
    pipe<NewOutType>(fn: PipelineTransform<StreamMessage, NewOutType>): Pipeline<StreamMessage, NewOutType> {
        return this.pipeline.pipe(fn)
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
    isDone(): boolean {
        return this.pipeline.isDone()
    }

    /** @internal */
    return(): Promise<unknown> {
        return this.pipeline.return()
    }
}
