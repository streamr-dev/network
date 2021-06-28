import { ControlLayer, PublishRequest, StreamMessage } from 'streamr-client-protocol'

import { uuid, LimitAsyncFnByKey } from '../utils'
import { inspect } from '../utils/log'
import { waitForRequestResponse } from '../stream/utils'

import { GroupKey } from '../stream'
import { StreamrClient } from '../StreamrClient'
import StreamMessageCreator from './MessageCreator'
import { StreamIDish, getStreamId } from './utils'

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

/**
 * Add handle to keep connection open while publishing.
 * Refreshes handle timeout on each call.
 * Only remove publish handle after inactivity of options.publishAutoDisconnectDelay ms.
 */

export default class Publisher {
    readonly debug
    readonly sendQueue: ReturnType<typeof LimitAsyncFnByKey>
    readonly streamMessageCreator
    readonly client

    private readonly onErrorEmit
    private readonly publishHandle
    private publishHandleTimeout?: ReturnType<typeof setTimeout>

    constructor(client: StreamrClient) {
        this.publishHandle = Symbol('publish')
        this.client = client
        this.debug = client.debug.extend('Publisher')
        this.sendQueue = LimitAsyncFnByKey(1)
        this.clearRemovePublishHandleTimeout = this.clearRemovePublishHandleTimeout.bind(this)
        this.streamMessageCreator = new StreamMessageCreator(client)
        this.onErrorEmit = client.getErrorEmitter({
            debug: this.debug
        })
    }

    async listenForErrors(request: PublishRequest) {
        // listen for errors for this request for 3s
        await waitForRequestResponse(this.client, request, {
            timeout: 3000,
            rejectOnTimeout: false,
        })
    }

    private async sendMessage(streamMessage: StreamMessage, sessionToken?: string) {
        const { client } = this
        const requestId = uuid('pub')
        const request = new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken: sessionToken || null,
        })

        this.listenForErrors(request).catch(this.onErrorEmit) // unchained async

        // send calls should probably also fire in-order otherwise new realtime streams
        // can miss messages that are sent late
        await client.send(request)
        return request
    }

    async publishMessage(streamObjectOrId: StreamIDish, {
        content,
        timestamp = new Date(),
        partitionKey
    }: {
        content: any
        timestamp?: string | number | Date
        partitionKey?: string | number
    }): Promise<PublishRequest> {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const streamId = getStreamId(streamObjectOrId)

        // get session, connection + generate stream message in parallel
        // NOTE: createStreamMessage *must* be executed in publish() call order or sequencing will be broken.
        // i.e. don't do anything async before calling createStreamMessage

        const asyncDepsTask = Promise.all([ // intentional no await
            // no async before running createStreamMessage
            this.streamMessageCreator.create(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            }),
            this.setupPublishHandle(), // autoconnect client if necessary
        ])

        asyncDepsTask.catch(() => {
            // prevent unhandledrejection, should wait for queue
            // will still reject in queue
        })

        // no async before running sendQueue
        return this.sendQueue(streamId, async () => {
            const [streamMessage] = await asyncDepsTask
            const sessionToken = await this.client.session.getSessionToken()
            try {
                return await this.sendMessage(streamMessage, sessionToken)
            } finally {
                this.refreshAutoDisconnectTimeout()
            }
        })
    }

    /**
     * Create publish handle to keep connection open while publishing.
     */
    private async setupPublishHandle() {
        // remove any existing
        this.clearRemovePublishHandleTimeout()
        this.client.connection.once('done', this.clearRemovePublishHandleTimeout)
        await this.client.connection.addHandle(this.publishHandle)
    }

    private clearRemovePublishHandleTimeout() {
        const timeout = this.publishHandleTimeout
        if (timeout) {
            clearTimeout(timeout!)
            this.publishHandleTimeout = undefined
        }
        this.client.connection.off('done', this.clearRemovePublishHandleTimeout)
    }

    /**
     * Reset publish handle timeout, or start new
     */
    private refreshAutoDisconnectTimeout() {
        const { client } = this
        this.clearRemovePublishHandleTimeout()
        if (!client.connection.connectionHandles.has(this.publishHandle)) {
            // do nothing if already removed
            return
        }

        const { publishAutoDisconnectDelay = 5000 } = client.options
        this.publishHandleTimeout = setTimeout(async () => { // eslint-disable-line require-atomic-updates
            this.clearRemovePublishHandleTimeout()
            try {
                await client.connection.removeHandle(this.publishHandle)
            } catch (err) {
                client.emit('error', err)
            }
        }, publishAutoDisconnectDelay || 0)
    }

    async publish(streamObjectOrId: StreamIDish, content: any, timestamp?: string | number | Date, partitionKey?: string | number) {
        // wrap publish in error emitter
        try {
            return await this.publishMessage(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            })
        } catch (err) {
            const streamId = getStreamId(streamObjectOrId)
            const error = new FailedToPublishError(
                streamId,
                content,
                err
            )
            this.onErrorEmit(error)
            throw error
        }
    }

    async startKeyExchange() {
        return this.streamMessageCreator.startKeyExchange()
    }

    async stop(): Promise<void> {
        this.sendQueue.clear()
        this.clearRemovePublishHandleTimeout()
        await this.streamMessageCreator.stop()
        await this.client.connection.removeHandle(this.publishHandle)
    }

    rotateGroupKey(streamId: string) {
        return this.streamMessageCreator.rotateGroupKey(streamId)
    }

    setNextGroupKey(streamId: string, newKey: GroupKey) {
        return this.streamMessageCreator.setNextGroupKey(streamId, newKey)
    }

    rekey(streamId: string) {
        return this.streamMessageCreator.rekey(streamId)
    }
}
