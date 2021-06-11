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
    constructor(streamId: string, msg: string, reason?: Error) {
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

const PUBLISH_HANDLE = Symbol('publish')

const publishHandleOnDone: WeakMap<StreamrClient, (...args: any[]) => void> = new WeakMap()
const publishHandleTimeouts: WeakMap<StreamrClient, ReturnType<typeof setTimeout>> = new WeakMap()

const cleanupPublishHandle = (client: StreamrClient) => {
    const timeout = publishHandleTimeouts.get(client)
    if (timeout) {
        clearTimeout(timeout!)
        publishHandleTimeouts.delete(client)
    }

    const onDone = publishHandleOnDone.get(client)
    if (onDone) {
        client.connection.off('done', onDone)
        publishHandleOnDone.delete(client)
    }
}

async function setupPublishHandle(client: StreamrClient) {
    // remove any existing
    cleanupPublishHandle(client)
    const cleanup = () => cleanupPublishHandle(client)
    client.connection.once('done', cleanup)
    publishHandleOnDone.set(client, cleanup)

    await client.connection.addHandle(PUBLISH_HANDLE)
}

export default class Publisher {
    debug
    sendQueue: ReturnType<typeof LimitAsyncFnByKey>
    streamMessageCreator
    onErrorEmit
    client
    constructor(client: StreamrClient) {
        this.client = client
        this.debug = client.debug.extend('Publisher')
        this.sendQueue = LimitAsyncFnByKey(1)
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
        try {
            await client.send(request)
        } finally {
            const { publishAutoDisconnectDelay = 5000 } = client.options
            publishHandleTimeouts.set(client, setTimeout(async () => { // eslint-disable-line require-atomic-updates
                cleanupPublishHandle(client)
                try {
                    await client.connection.removeHandle(PUBLISH_HANDLE)
                } catch (err) {
                    client.emit('error', err)
                }
            }, publishAutoDisconnectDelay || 0))
        }
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
    }) {
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
            this.client.session.getSessionToken(), // fetch in parallel
            setupPublishHandle(this.client),
        ])

        asyncDepsTask.catch(() => {
            // prevent unhandledrejection, should wait for queue
            // will still reject in queue
        })

        // no async before running sendQueue
        return this.sendQueue(streamId, async () => {
            const [streamMessage, sessionToken] = await asyncDepsTask
            return this.send(streamMessage, sessionToken)
        })
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
        cleanupPublishHandle(this.client)
        await this.client.connection.removeHandle(PUBLISH_HANDLE)
        await this.streamMessageCreator.stop()
        this.streamMessageCreator = undefined
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
