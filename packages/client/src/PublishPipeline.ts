import { StreamMessage, MessageContent } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'

import { inspect } from './utils/log'
import { instanceId, Defer, Deferred } from './utils'
import { Context, ContextError } from './utils/Context'
import { PushPipeline, Pipeline } from './utils/Pipeline'
import { Stoppable } from './utils/Stoppable'

import StreamMessageCreator from './MessageCreator'
import BrubeckNode from './BrubeckNode'
import Signer from './Signer'
import Encrypt from './Encrypt'

export class FailedToPublishError extends Error {
    streamId
    msg
    reason
    constructor(streamId: string, msg: any, reason?: Error) {
        super(`Failed to publish to stream ${streamId} due to: ${reason && reason.stack ? reason.stack : reason}. Message was: ${inspect(msg)}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: any) {
        return inspect(this, {
            ...options,
            customInspect: false,
            depth,
        })
    }
}

export type PublishMetadata<T extends MessageContent | unknown = unknown> = {
    content: T
    timestamp?: string | number | Date
    sequenceNumber?: number
    partitionKey?: string | number
}

export type PublishMetadataStrict<T extends MessageContent | unknown = unknown> = PublishMetadata<T> & {
    timestamp: number
    streamId: string
    partitionKey: number | string
}

export type PublishQueueIn<T = unknown> = [PublishMetadataStrict<T>, Deferred<StreamMessage<T>>]
export type PublishQueueOut<T = unknown> = [StreamMessage<T>, Deferred<StreamMessage<T>>]

@scoped(Lifecycle.ContainerScoped)
export default class PublishPipeline implements Context, Stoppable {
    id
    debug
    /** takes metadata & creates stream messages. unsigned, unencrypted */
    streamMessageQueue!: PushPipeline<PublishQueueIn, PublishQueueOut>
    /** signs, encrypts then publishes messages */
    publishQueue!: Pipeline<PublishQueueOut, PublishQueueOut>
    isStarted = false
    isStopped = false
    inProgress = new Set<Deferred<StreamMessage>>()

    constructor(
        context: Context,
        private node: BrubeckNode,
        private messageCreator: StreamMessageCreator,
        private signer: Signer,
        @inject(delay(() => Encrypt)) private encryption: Encrypt,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamMessageQueue = new PushPipeline<PublishQueueIn>()
            .pipe(this.toStreamMessage.bind(this))
            .filter(this.filterResolved)

        this.publishQueue = new Pipeline<PublishQueueOut>(this.streamMessageQueue)
            .forEach(this.encryptMessage.bind(this))
            .filter(this.filterResolved)
            .forEach(this.signMessage.bind(this))
            .filter(this.filterResolved)
            .forEach(this.consumeQueue.bind(this))
    }

    private filterResolved = ([_streamMessage, defer]: PublishQueueOut): boolean => {
        return !defer.isResolved()
    }

    private async* toStreamMessage(src: AsyncGenerator<PublishQueueIn>): AsyncGenerator<PublishQueueOut> {
        for await (const [publishMetadata, defer] of src) {
            const { streamId, ...options } = publishMetadata
            try {
                const streamMessage = await this.messageCreator.create(streamId, options)
                yield [streamMessage, defer]
            } catch (err) {
                defer.reject(err)
                continue
            }
        }
    }

    private async encryptMessage([streamMessage, defer]: PublishQueueOut): Promise<void> {
        const onError = (err: Error) => {
            defer.reject(err)
        }

        if (StreamMessage.isUnencrypted(streamMessage)) {
            await this.encryption.encrypt(streamMessage).catch(onError)
        }
    }

    private async signMessage([streamMessage, defer]: PublishQueueOut): Promise<void> {
        if (defer.isResolved()) { return }
        const onError = (err: Error) => {
            defer.reject(err)
        }

        if (StreamMessage.isUnsigned(streamMessage)) {
            await this.signer.sign(streamMessage).catch(onError)
        }
    }

    private async consumeQueue([streamMessage, defer]: PublishQueueOut): Promise<void> {
        if (defer.isResolved()) { return }

        try {
            this.check()
            await this.node.publishToNode(streamMessage)
        } catch (err) {
            defer.reject(err)
        }
        defer.resolve(streamMessage)
    }

    /**
     * Starts queue if not already started.
     */
    private startQueue(): void {
        if (this.isStarted || this.isStopped) { return }

        this.isStarted = true

        this.publishQueue.consume(() => {
            this.debug('consume')
        }).catch(this.debug.bind(this.debug))
    }

    check(): void {
        if (this.isStopped) {
            throw new ContextError(this, 'Pipeline Stopped. Client probably disconnected')
        }
    }

    /**
     * Put publish metadata into queue to be published.
     * Creates a Defer to be resolved when message gets sent to node.
     */
    async publish<T>(publishMetadata: PublishMetadataStrict<T>): Promise<StreamMessage<T>> {
        this.debug('publish >> %o', publishMetadata)
        this.startQueue()

        const defer = Defer<StreamMessage<T>>()
        try {
            this.inProgress.add(defer)
            this.check()
            await this.streamMessageQueue.push([publishMetadata, defer])
            return await defer
        } catch (err) {
            const error = new FailedToPublishError(publishMetadata.streamId, publishMetadata, err)
            defer.reject(error)
            throw error
        } finally {
            this.inProgress.delete(defer)
            this.debug('publish <<')
        }
    }

    start(): void {
        this.isStopped = false
    }

    async stop(): Promise<void> {
        this.isStopped = true
        const inProgress = new Set(this.inProgress)
        this.inProgress.clear()
        inProgress.forEach((defer) => {
            defer.reject(new ContextError(this, 'Pipeline Stopped. Client probably disconnected'))
        })
        await Promise.allSettled([
            this.encryption.stop(),
            this.messageCreator.stop(),
        ])
    }
}
