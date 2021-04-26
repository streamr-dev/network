import { Todo } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { NetworkNode, Protocol } from 'streamr-network'
const { ControlLayer, Utils } = Protocol
import { HttpError } from '../errors/HttpError'
import { FailedToPublishError } from '../errors/FailedToPublishError'
import getLogger from '../helpers/logger'
import StreamStateManager from '../StreamStateManager' 
import { Metrics } from 'streamr-network/dist/helpers/MetricsContext'
import { Publisher } from '../Publisher'
import { SubscriptionManager } from '../SubscriptionManager'
import { Connection } from './Connection'
import { MAX_SEQUENCE_NUMBER_VALUE, MIN_SEQUENCE_NUMBER_VALUE } from '../http/DataQueryEndpoints'

const logger = getLogger('streamr:RequestHandlers')
type RequestHandler = (Connection: Todo, request: Todo) => void

export class RequestHandlers {

    networkNode: NetworkNode
    streamFetcher: Todo
    publisher: Publisher
    streams: Todo
    subscriptionManager: SubscriptionManager
    metrics: Metrics
    requestHandlersByMessageType: Record<Todo,(connection: Connection, request: Todo) => Todo>

    constructor(   
        networkNode: NetworkNode,
        streamFetcher: Todo,
        publisher: Publisher,
        subscriptionManager: SubscriptionManager,
        metrics: Metrics
    ) {
        this.networkNode = networkNode
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.subscriptionManager = subscriptionManager
        this.metrics = metrics
        this.requestHandlersByMessageType = {
            [ControlLayer.ControlMessage.TYPES.SubscribeRequest]: this.handleSubscribeRequest,
            [ControlLayer.ControlMessage.TYPES.UnsubscribeRequest]: this.handleUnsubscribeRequest,
            [ControlLayer.ControlMessage.TYPES.ResendLastRequest]: this.handleResendLastRequest,
            [ControlLayer.ControlMessage.TYPES.ResendFromRequest]: this.handleResendFromRequest,
            [ControlLayer.ControlMessage.TYPES.ResendRangeRequest]: this.handleResendRangeRequest,
            [ControlLayer.ControlMessage.TYPES.PublishRequest]: this.handlePublishRequest,
        }
        this.streams = new StreamStateManager()
        this.networkNode.addMessageListener(this._broadcastMessage.bind(this))
    }

    getInstance(messageType: Todo): RequestHandler|undefined {
        return this.requestHandlersByMessageType[messageType]
    }

    async handlePublishRequest(connection: Connection, request: Todo) {
        const { streamMessage } = request

        try {
            // Legacy validation: for unsigned messages, we additionally need to do an authenticated check of publish permission
            // This can be removed when support for unsigned messages is dropped!
            if (!streamMessage.signature) {
                // checkPermission is cached
                await this.streamFetcher.checkPermission(request.streamMessage.getStreamId(), request.sessionToken, 'stream_publish')
            }

            await this.publisher.validateAndPublish(streamMessage)
        } catch (err) {
            let errorMessage
            let errorCode
            if (err instanceof HttpError && err.code === 401) {
                errorMessage = `Authentication failed while trying to publish to stream ${streamMessage.getStreamId()}`
                errorCode = 'AUTHENTICATION_FAILED'
            } else if (err instanceof HttpError && err.code === 403) {
                errorMessage = `You are not allowed to write to stream ${streamMessage.getStreamId()}`
                errorCode = 'PERMISSION_DENIED'
            } else if (err instanceof HttpError && err.code === 404) {
                errorMessage = `Stream ${streamMessage.getStreamId()} not found.`
                errorCode = 'NOT_FOUND'
            } else if (err instanceof FailedToPublishError) {
                errorMessage = err.message
                errorCode = 'FUTURE_TIMESTAMP'
            } else {
                errorMessage = `Publish request failed: ${err.message || err}`
                errorCode = 'REQUEST_FAILED'
            }

            connection.send(new ControlLayer.ErrorResponse({
                version: request.version,
                requestId: request.requestId,
                errorMessage,
                // @ts-expect-error
                errorCode,
            }))
        }
    }

    // TODO: Extract resend stuff to class?
    async handleResendRequest(connection: Connection, request: Todo, resendTypeHandler: Todo) {
        let nothingToResend = true
        let sentMessages = 0

        const msgHandler = (unicastMessage: Todo) => {
            if (nothingToResend) {
                nothingToResend = false
                connection.send(new ControlLayer.ResendResponseResending(request))
            }

            const { streamMessage } = unicastMessage
            this.metrics.record('outBytes', streamMessage.getSerializedContent().length)
            this.metrics.record('outMessages', 1)
            sentMessages += 1
            connection.send(new ControlLayer.UnicastMessage({
                version: request.version,
                requestId: request.requestId,
                streamMessage,
            }))
        }

        const doneHandler = () => {
            logger.info('Finished resend %s for stream %s with a total of %d sent messages', request.requestId, request.streamId, sentMessages)
            if (nothingToResend) {
                connection.send(new ControlLayer.ResendResponseNoResend({
                    version: request.version,
                    requestId: request.requestId,
                    streamId: request.streamId,
                    streamPartition: request.streamPartition,
                }))
            } else {
                connection.send(new ControlLayer.ResendResponseResent({
                    version: request.version,
                    requestId: request.requestId,
                    streamId: request.streamId,
                    streamPartition: request.streamPartition,
                }))
            }
        }

        try {
            await this._validateSubscribeOrResendRequest(request)
            if (connection.isDead()) {
                return
            }
            const streamingStorageData = resendTypeHandler()
            const pauseHandler = () => streamingStorageData.pause()
            const resumeHandler = () => streamingStorageData.resume()
            connection.addOngoingResend(streamingStorageData)
            streamingStorageData.on('data', msgHandler)
            streamingStorageData.on('end', doneHandler)
            connection.on('highBackPressure', pauseHandler)
            connection.on('lowBackPressure', resumeHandler)
            streamingStorageData.once('end', () => {
                connection.removeOngoingResend(streamingStorageData)
                connection.removeListener('highBackPressure', pauseHandler)
                connection.removeListener('lowBackPressure', resumeHandler)
            })
        } catch (err) {
            connection.send(new ControlLayer.ErrorResponse({
                version: request.version,
                requestId: request.requestId,
                errorMessage: `Failed to request resend from stream ${request.streamId} and partition ${request.streamPartition}: ${err.message}`,
                errorCode: err.errorCode || 'RESEND_FAILED',
            }))
        }
    }

    async handleResendLastRequest(connection: Connection, request: Todo) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendLast(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.numberLast,
        ))
    }

    async handleResendFromRequest(connection: Connection, request: Todo) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendFrom(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.fromMsgRef.timestamp,
            // TODO client should provide sequenceNumber, remove MIN_SEQUENCE_NUMBER_VALUE defaults when NET-267 have been implemented
            request.fromMsgRef.sequenceNumber || MIN_SEQUENCE_NUMBER_VALUE,
            request.publisherId,
            request.msgChainId,
        ))
    }

    async handleResendRangeRequest(connection: Connection, request: Todo) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendRange(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.fromMsgRef.timestamp,
            // TODO client should provide sequenceNumber, remove MIN_SEQUENCE_NUMBER_VALUE&MAX_SEQUENCE_NUMBER_VALUE defaults when NET-267 have been implemented
            request.fromMsgRef.sequenceNumber || MIN_SEQUENCE_NUMBER_VALUE,  
            request.toMsgRef.timestamp,
            request.toMsgRef.sequenceNumber || MAX_SEQUENCE_NUMBER_VALUE,
            request.publisherId,
            request.msgChainId,
        ))
    }

    _broadcastMessage(streamMessage: Todo) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, streamPartition)

        if (stream) {
            stream.forEachConnection((connection: Todo) => {
                connection.send(new ControlLayer.BroadcastMessage({
                    requestId: '', // TODO: can we have here the requestId of the original SubscribeRequest?
                    streamMessage,
                }))
            })

            this.metrics.record('outBytes', streamMessage.getSerializedContent().length * stream.getConnections().length)
            this.metrics.record('outMessages', stream.getConnections().length)
        } else {
            logger.debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    async handleSubscribeRequest(connection: Connection, request: Todo) {
        try {
            await this._validateSubscribeOrResendRequest(request)

            if (connection.isDead()) {
                return
            }
            const stream = this.streams.getOrCreate(request.streamId, request.streamPartition)

            // Subscribe now if the stream is not already subscribed or subscribing
            if (!stream.isSubscribed() && !stream.isSubscribing()) {
                stream.setSubscribing()
                this.subscriptionManager.subscribe(request.streamId, request.streamPartition)
                stream.setSubscribed()
            }

            stream.addConnection(connection)
            connection.addStream(stream)
            logger.debug(
                'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
                connection.id, connection.streamsAsString()
            )
            connection.send(new ControlLayer.SubscribeResponse({
                version: request.version,
                requestId: request.requestId,
                streamId: request.streamId,
                streamPartition: request.streamPartition,
            }))
        } catch (err) {
            logger.debug(
                'handleSubscribeRequest: socket "%s" failed to subscribe to stream %s:%d because of "%o"',
                connection.id, request.streamId, request.streamPartition, err
            )

            let errorMessage
            let errorCode
            if (err instanceof HttpError && err.code === 401) {
                errorMessage = `Authentication failed while trying to subscribe to stream ${request.streamId}`
                errorCode = 'AUTHENTICATION_FAILED'
            } else if (err instanceof HttpError && err.code === 403) {
                errorMessage = `You are not allowed to subscribe to stream ${request.streamId}`
                errorCode = 'PERMISSION_DENIED'
            } else if (err instanceof HttpError && err.code === 404) {
                errorMessage = `Stream ${request.streamId} not found.`
                errorCode = 'NOT_FOUND'
            } else {
                errorMessage = `Subscribe request failed: ${err}`
                errorCode = 'REQUEST_FAILED'
            }

            connection.send(new ControlLayer.ErrorResponse({
                version: request.version,
                requestId: request.requestId,
                errorMessage,
                // @ts-expect-error
                errorCode,
            }))
        }
    }

    handleUnsubscribeRequest(connection: Connection, request: Todo, noAck = false) {
        const stream = this.streams.get(request.streamId, request.streamPartition)

        if (stream) {
            logger.debug('handleUnsubscribeRequest: socket "%s" unsubscribing from stream "%s:%d"', connection.id,
                request.streamId, request.streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(request.streamId, request.streamPartition)

            logger.debug(
                'handleUnsubscribeRequest: socket "%s" is still subscribed to streams "%o"',
                connection.id, connection.streamsAsString()
            )

            // Unsubscribe from stream if no connections left
            logger.debug(
                'checkRoomEmpty: "%d" sockets remaining on stream "%s:%d"',
                stream.getConnections().length, request.streamId, request.streamPartition
            )
            if (stream.getConnections().length === 0) {
                logger.debug(
                    'checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.',
                    request.streamId, request.streamPartition
                )
                this.subscriptionManager.unsubscribe(request.streamId, request.streamPartition)
                this.streams.delete(request.streamId, request.streamPartition)
            }

            if (!noAck) {
                connection.send(new ControlLayer.UnsubscribeResponse({
                    version: request.version,
                    requestId: request.requestId,
                    streamId: request.streamId,
                    streamPartition: request.streamPartition
                }))
            }
        } else {
            logger.debug(
                'handleUnsubscribeRequest: stream "%s:%d" no longer exists',
                request.streamId, request.streamPartition
            )
            if (!noAck) {
                connection.send(new ControlLayer.ErrorResponse({
                    version: request.version,
                    requestId: request.requestId,
                    errorMessage: `Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`,
                    // @ts-expect-error
                    errorCode: 'INVALID_REQUEST',
                }))
            }
        }
    }

    async _validateSubscribeOrResendRequest(request: Todo) {
        if (Utils.StreamMessageValidator.isKeyExchangeStream(request.streamId)) {
            if (request.streamPartition !== 0) {
                throw new Error(`Key exchange streams only have partition 0. Tried to subscribe to ${request.streamId}:${request.streamPartition}`)
            }
        } else {
            await this.streamFetcher.checkPermission(request.streamId, request.sessionToken, 'stream_subscribe')
        }
    }

    close() {
        this.streams.close()
    }
}