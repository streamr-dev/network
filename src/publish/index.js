import { inspect } from 'util'
import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { ethers } from 'ethers'
import mem from 'mem'

import { uuid, CacheAsyncFn, CacheFn, LimitAsyncFnByKey, randomString } from '../utils'
import { waitForRequestResponse } from '../stream/utils'

import Signer from './Signer'

export class FailedToPublishError extends Error {
    constructor(streamId, msg, reason) {
        super(`Failed to publish to stream ${streamId} due to: ${reason}. Message was: ${inspect(msg)}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

const { StreamMessage, MessageID, MessageRef } = MessageLayer

function getStreamId(streamObjectOrId) {
    if (streamObjectOrId.streamId != null) {
        return streamObjectOrId.streamId
    }

    if (streamObjectOrId.id != null) {
        return streamObjectOrId.id
    }

    if (streamObjectOrId && typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${inspect(streamObjectOrId)}`)
}

function hash(stringToHash) {
    return crypto.createHash('md5').update(stringToHash).digest()
}

function MessageChainer({ streamId, streamPartition, publisherId, msgChainId = randomString(20) } = {}) {
    let prevMsgRef = null

    /**
     * Generate the next message MessageID + previous MessageRef for this message chain.
     * Messages with same timestamp get incremented sequence numbers.
     */

    return function add(timestamp) {
        // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
        // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
        // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
        // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
        // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
        // Possible we should keep a global sequence number
        const isSameTimestamp = prevMsgRef && prevMsgRef.timestamp === timestamp
        const isBackdated = prevMsgRef && prevMsgRef.timestamp > timestamp
        // increment if timestamp the same, otherwise 0
        const nextSequenceNumber = isSameTimestamp ? prevMsgRef.sequenceNumber + 1 : 0
        const messageId = new MessageID(streamId, streamPartition, timestamp, nextSequenceNumber, publisherId, msgChainId)
        // update latest timestamp + sequence for this streamId+partition
        // (see note above about clobbering sequencing)
        // don't update latest if timestamp < previous timestamp
        // this "fixes" the sequence breaking issue above, but this message will silently disappear
        const currentPrevMsgRef = prevMsgRef
        if (!isBackdated) {
            prevMsgRef = new MessageRef(timestamp, nextSequenceNumber)
        }
        return [messageId, currentPrevMsgRef]
    }
}

function StreamPartitioner(cacheOptions) {
    const cachedHash = CacheFn(hash, cacheOptions)
    function computeStreamPartition(partitionCount, partitionKey) {
        if (!(Number.isSafeInteger(partitionCount) && partitionCount > 0)) {
            throw new Error(`partitionCount is not a safe positive integer! ${partitionCount}`)
        }

        if (partitionCount === 1) {
            // Fast common case
            return 0
        }

        if (typeof partitionKey === 'number') {
            return Math.abs(partitionKey) % partitionCount
        }

        if (!partitionKey) {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }

        const buffer = cachedHash(partitionKey)
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    }

    computeStreamPartition.clear = cachedHash.clear
    return computeStreamPartition
}

async function getUsername(client) {
    const { options: { auth = {} } = {} } = client
    if (auth.username) { return auth.username }

    const { username, id } = await client.getUserInfo()
    return (
        username
        // edge case: if auth.apiKey is an anonymous key, userInfo.id is that anonymous key
        || id
    )
}

async function getPublisherId(client) {
    if (client.session.isUnauthenticated()) {
        throw new Error('Need to be authenticated to getPublisherId.')
    }

    const { options: { auth = {} } = {} } = client
    if (auth.privateKey) {
        return ethers.utils.computeAddress(auth.privateKey).toLowerCase()
    }

    if (auth.provider) {
        const provider = new ethers.providers.Web3Provider(auth.provider)
        return provider.getSigner().address.toLowerCase()
    }

    const username = await getUsername(client)

    if (username != null) {
        const hexString = ethers.utils.hexlify(Buffer.from(username, 'utf8'))
        return ethers.utils.sha256(hexString)
    }

    throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to derive the publisher Id.')
}

/*
 * Get function for creating stream messages.
 */

function getCreateStreamMessage(client) {
    const cacheOptions = client.options.cache
    const computeStreamPartition = StreamPartitioner(cacheOptions)

    // make cached stream & publisher details
    const getCachedStream = CacheAsyncFn(client.getStream.bind(client), cacheOptions)
    const getCachedPublisherId = CacheAsyncFn(getPublisherId.bind(null, client), cacheOptions)

    // one chainer per streamId + streamPartition + publisherId + msgChainId
    const getMsgChainer = Object.assign(mem(MessageChainer, {
        cacheKey: ({ streamId, streamPartition, publisherId, msgChainId }) => (
            // undefined msgChainId is fine
            [streamId, streamPartition, publisherId, msgChainId].join('|')
        ),
        ...cacheOptions,
    }), {
        clear() {
            mem.clear(getMsgChainer)
        }
    })

    // message signer
    const signStreamMessage = Signer({
        ...client.options.auth,
        debug: client.debug,
    }, client.options.publishWithSignature)

    // per-stream queue so messages processed in-order
    const queue = LimitAsyncFnByKey(1)

    function createStreamMessage(streamObjectOrId, {
        content,
        timestamp,
        partitionKey,
        msgChainId,
        ...opts
    }) {
        const streamId = getStreamId(streamObjectOrId)
        // streamId as queue key
        return queue(streamId, async () => {
            // load cached stream + publisher details
            const [stream, publisherId] = await Promise.all([
                getCachedStream(streamId),
                getCachedPublisherId(client),
            ])

            // figure out partition
            const streamPartition = computeStreamPartition(stream.partitions, partitionKey)

            // chain messages
            const chainMessage = getMsgChainer({
                streamId, streamPartition, publisherId, msgChainId
            })

            const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
            const [messageId, prevMsgRef] = chainMessage(timestampAsNumber)

            const streamMessage = new StreamMessage({
                messageId,
                prevMsgRef,
                content,
                ...opts
            })

            // sign, noop if not needed
            await signStreamMessage(streamMessage)

            return streamMessage
        })
    }

    return Object.assign(createStreamMessage, {
        getCachedPublisherId,
        clear() {
            computeStreamPartition.clear()
            getCachedStream.clear()
            getCachedPublisherId.clear()
            getMsgChainer.clear()
            queue.clear()
        }
    })
}

/**
 * Add handle to keep connection open while publishing.
 * Refreshes handle timeout on each call.
 * Only remove publish handle after inactivity of options.publishAutoDisconnectDelay ms.
 */

const PUBLISH_HANDLE = Symbol('publish')

async function setupPublishHandle(client) {
    const onConnectionDone = () => clearTimeout(setupPublishHandle.timeout)
    try {
        clearTimeout(setupPublishHandle.timeout)
        client.connection.addListener('done', onConnectionDone)
        await client.connection.addHandle(PUBLISH_HANDLE)
    } finally {
        const { publishAutoDisconnectDelay = 5000 } = client.options
        clearTimeout(setupPublishHandle.timeout)
        setupPublishHandle.timeout = setTimeout(async () => { // eslint-disable-line require-atomic-updates
            try {
                await client.connection.removeHandle(PUBLISH_HANDLE)
            } catch (err) {
                client.emit('error', err)
            }
        }, publishAutoDisconnectDelay || 0)
    }
}

export default function Publisher(client) {
    const debug = client.debug.extend('Publisher')
    const sendQueue = LimitAsyncFnByKey(1)
    const createStreamMessage = getCreateStreamMessage(client)
    const onErrorEmit = client.getErrorEmitter({
        debug
    })

    async function listenForErrors(request) {
        // listen for errors for this request for 3s
        return waitForRequestResponse(client, request, {
            timeout: 3000,
            rejectOnTimeout: false,
        })
    }

    async function publishMessage(streamObjectOrId, content, timestamp = new Date(), partitionKey = null) {
        if (client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const streamId = getStreamId(streamObjectOrId)

        // get session, connection + generate stream message in parallel
        // NOTE: createStreamMessage *must* be executed in publish() call order or sequencing will be broken.
        // i.e. don't do anything async before calling createStreamMessage

        const asyncDepsTask = Promise.all([ // intentional no await
            // no async before running createStreamMessage
            createStreamMessage(streamObjectOrId, {
                content,
                timestamp,
                partitionKey
            }),
            client.session.getSessionToken(), // fetch in parallel
            setupPublishHandle(client),
        ])

        // no async before running sendQueue
        return sendQueue(streamId, async () => {
            const [streamMessage, sessionToken] = await asyncDepsTask
            const requestId = uuid('pub')
            const request = new ControlLayer.PublishRequest({
                streamMessage,
                requestId,
                sessionToken,
            })

            listenForErrors(request).catch(onErrorEmit) // unchained async

            // send calls should probably also fire in-order otherwise new realtime streams
            // can miss messages that are sent late
            await client.send(request)
            return request
        })
    }

    return {
        async publish(streamObjectOrId, content, ...args) {
            debug('publish()')
            // wrap publish in error emitter
            try {
                return await publishMessage(streamObjectOrId, content, ...args)
            } catch (err) {
                const streamId = getStreamId(streamObjectOrId)
                const error = new FailedToPublishError(
                    streamId,
                    content,
                    err
                )
                onErrorEmit(error)
                throw error
            }
        },
        async stop() {
            sendQueue.clear()
            createStreamMessage.clear()
        },
        async getPublisherId() {
            return createStreamMessage.getCachedPublisherId()
        }
    }
}
