import { Protocol } from 'streamr-network'
const { ControlLayer, Utils, ControlMessageType } = Protocol
import { ArrayMultimap } from '@teppeis/multimaps'
import { HttpError } from '../../errors/HttpError'
import { FailedToPublishError } from '../../errors/FailedToPublishError'
import { Logger } from 'streamr-network'
import { StreamStateManager } from '../../StreamStateManager' 
import { Metrics } from 'streamr-network/dist/helpers/MetricsContext'
import { Publisher } from '../../Publisher'
import { SubscriptionManager } from '../../SubscriptionManager'
import { Connection } from './Connection'
import { StreamFetcher } from '../../StreamFetcher'
import { StorageNodeRegistry } from '../../StorageNodeRegistry'
import { createResponse as createHistoricalDataResponse, HistoricalDataResponse } from './historicalData'
import { GenericError } from '../../errors/GenericError'

const logger = new Logger(module)

type SubscribeRequest = Protocol.ControlLayer.SubscribeRequest
type UnsubscribeRequest = Protocol.ControlLayer.UnsubscribeRequest
type ResendLastRequest = Protocol.ControlLayer.ResendLastRequest
type ResendFromRequest = Protocol.ControlLayer.ResendFromRequest
type ResendRangeRequest = Protocol.ControlLayer.ResendRangeRequest
type PublishRequest = Protocol.ControlLayer.PublishRequest

export class RequestHandler {

    streamFetcher: StreamFetcher
    publisher: Publisher
    streams: StreamStateManager
    subscriptionManager: SubscriptionManager
    metrics: Metrics
    storageNodeRegistry: StorageNodeRegistry
    streamrUrl: string
    ongoingResendResponses: ArrayMultimap<string,HistoricalDataResponse> = new ArrayMultimap()

    constructor(   
        streamFetcher: StreamFetcher,
        publisher: Publisher,
        streams: StreamStateManager,
        subscriptionManager: SubscriptionManager,
        metrics: Metrics,
        storageNodeRegistry: StorageNodeRegistry,
        streamrUrl: string
    ) {
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.streams = streams
        this.subscriptionManager = subscriptionManager
        this.metrics = metrics
        this.storageNodeRegistry = storageNodeRegistry,
        this.streamrUrl = streamrUrl
        this.metrics.addQueriedMetric('numOfOngoingResends', () => this.ongoingResendResponses.size)
        this.metrics.addQueriedMetric('meanAgeOfOngoingResends', () => {
            if (this.ongoingResendResponses.size > 0) {
                const now = Date.now()
                let sum = 0
                this.ongoingResendResponses.forEach((response) => {
                    const age = now - response.startTime
                    sum += age
                })
                return sum / this.ongoingResendResponses.size
            } else {
                return 0
            }
        })
    }

    handleRequest(connection: Connection, request: Protocol.ControlLayer.ControlMessage): Promise<any> {
        logger.debug(`WebSocket ${ControlMessageType[request.type]}: ${request.requestId}`)
        switch (request.type) {
            case ControlLayer.ControlMessage.TYPES.SubscribeRequest:
                return this.subscribe(connection, request as SubscribeRequest)
            case ControlLayer.ControlMessage.TYPES.UnsubscribeRequest:
                return this.unsubscribe(connection, request as UnsubscribeRequest)
            case ControlLayer.ControlMessage.TYPES.PublishRequest:
                return this.publish(connection, request as PublishRequest)
            case ControlLayer.ControlMessage.TYPES.ResendLastRequest:
            case ControlLayer.ControlMessage.TYPES.ResendFromRequest:
            case ControlLayer.ControlMessage.TYPES.ResendRangeRequest:
                return this.resend(connection, request as (ResendLastRequest|ResendFromRequest|ResendRangeRequest))
            default:
                connection.send(new ControlLayer.ErrorResponse({
                    version: request.version,
                    requestId: request.requestId,
                    errorMessage: `Unknown request type: ${request.type}`,
                    // @ts-expect-error
                    errorCode: 'INVALID_REQUEST',
                }))
                return Promise.resolve()
        }
    }

    private async publish(connection: Connection, request: PublishRequest) {
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

    private async resend(connection: Connection, request: ResendFromRequest|ResendLastRequest|ResendRangeRequest) {
        await this._validateSubscribeOrResendRequest(request)
        let streamingStorageData
        try {
            const response = await createHistoricalDataResponse(request, this.storageNodeRegistry)
            streamingStorageData = response.data
            this.ongoingResendResponses.put(connection.id, response)
        } catch (e: any) {
            this.sendError(e, request, connection)
            return
        }
        return this.sendResendResponse(connection, request, streamingStorageData)
    }

    private async sendResendResponse(
        connection: Connection, 
        request: ResendFromRequest|ResendLastRequest|ResendRangeRequest,
        streamingStorageData: NodeJS.ReadableStream
    ) {
        let sentMessages = 0
    
        const msgHandler = (streamMessage: Protocol.StreamMessage) => {
            if (sentMessages === 0) {
                connection.send(new ControlLayer.ResendResponseResending(request))
            }
    
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
            logger.info('Finished resend %s: %d messages', request.requestId, sentMessages)
            if (sentMessages === 0) {
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
            this.ongoingResendResponses.delete(connection.id)
        }
    
        try {
            if (connection.isDead()) {
                return
            }
            const pauseHandler = () => streamingStorageData.pause()
            const resumeHandler = () => streamingStorageData.resume()
            streamingStorageData.on('data', msgHandler)
            streamingStorageData.on('end', doneHandler)
            connection.on('highBackPressure', pauseHandler)
            connection.on('lowBackPressure', resumeHandler)
            streamingStorageData.once('end', () => {
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

    private sendError(e: Error, request: Protocol.ControlMessage, connection: Connection) {
        if (e instanceof GenericError) {
            logger.warn(e.message)
            connection.send(new ControlLayer.ErrorResponse({
                version: request.version,
                requestId: request.requestId,
                errorMessage: e.message,
                errorCode: e.code as any,
            }))
        } else {
            logger.error(`Assertion failed: unknown error "${e.message}"`)
            throw e
        }
    }

    private async subscribe(connection: Connection, request: SubscribeRequest) {
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
            logger.trace(
                'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
                connection.id, connection.getStreamsAsString()
            )
            connection.send(new ControlLayer.SubscribeResponse({
                version: request.version,
                requestId: request.requestId,
                streamId: request.streamId,
                streamPartition: request.streamPartition,
            }))
        } catch (err) {
            logger.trace(
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

    async unsubscribe(connection: Connection, request: UnsubscribeRequest, noAck = false) {
        const stream = this.streams.get(request.streamId, request.streamPartition)

        if (stream) {
            logger.trace('handleUnsubscribeRequest: socket "%s" unsubscribing from stream "%s:%d"', connection.id,
                request.streamId, request.streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(request.streamId, request.streamPartition)

            logger.trace(
                'handleUnsubscribeRequest: socket "%s" is still subscribed to streams "%o"',
                connection.id, connection.getStreamsAsString()
            )

            // Unsubscribe from stream if no connections left
            logger.trace(
                'checkRoomEmpty: "%d" sockets remaining on stream "%s:%d"',
                stream.getConnections().length, request.streamId, request.streamPartition
            )
            if (stream.getConnections().length === 0) {
                logger.trace(
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
            logger.trace(
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

    private async _validateSubscribeOrResendRequest(request: SubscribeRequest|ResendFromRequest|ResendLastRequest|ResendRangeRequest) {
        if (Utils.StreamMessageValidator.isKeyExchangeStream(request.streamId)) {
            if (request.streamPartition !== 0) {
                throw new Error(`Key exchange streams only have partition 0. Tried to subscribe to ${request.streamId}:${request.streamPartition}`)
            }
        } else {
            await this.streamFetcher.checkPermission(request.streamId, request.sessionToken, 'stream_subscribe')
        }
    }

    onConnectionClose(connectionId: string) {
        const ongoingResendResponses = this.ongoingResendResponses.get(connectionId)
        if (ongoingResendResponses.length > 0) {
            logger.info('Abort %s ongoing resends for connection %s', ongoingResendResponses.length, connectionId)
            ongoingResendResponses.forEach((response)=> response.abort())
            this.ongoingResendResponses.delete(connectionId)   
        }
    }

    close() {
        this.streams.close()
    }
}
