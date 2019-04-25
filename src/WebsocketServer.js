const events = require('events')
const debug = require('debug')('streamr:WebsocketServer')
const { ControlLayer, MessageLayer } = require('streamr-client-protocol')
const Stream = require('./Stream')
const Connection = require('./Connection')
const StreamStateManager = require('./StreamStateManager')
const HttpError = require('./errors/HttpError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class WebsocketServer extends events.EventEmitter {
    constructor(wss, networkNode, storage, streamFetcher, publisher, volumeLogger = new VolumeLogger(0)) {
        super()
        this.wss = wss
        this.networkNode = networkNode
        this.storage = storage
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.volumeLogger = volumeLogger
        this.streams = new StreamStateManager()

        this.requestHandlersByMessageType = {}
        this.requestHandlersByMessageType[ControlLayer.SubscribeRequest.TYPE] = this.handleSubscribeRequest
        this.requestHandlersByMessageType[ControlLayer.UnsubscribeRequest.TYPE] = this.handleUnsubscribeRequest
        this.requestHandlersByMessageType[ControlLayer.ResendRequestV0.TYPE] = this.handleResendRequestV0
        this.requestHandlersByMessageType[ControlLayer.ResendLastRequestV1.TYPE] = this.handleResendLastRequest
        this.requestHandlersByMessageType[ControlLayer.ResendFromRequestV1.TYPE] = this.handleResendFromRequest
        this.requestHandlersByMessageType[ControlLayer.ResendRangeRequestV1.TYPE] = this.handleResendRangeRequest
        this.requestHandlersByMessageType[ControlLayer.PublishRequest.TYPE] = this.handlePublishRequest

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))

        this.wss.on('connection', this.handleConnection.bind(this))
    }

    handleConnection(socket, request) {
        const connection = new Connection(socket, request)
        this.volumeLogger.connectionCount += 1
        debug('handleConnection: socket "%s" connected', connection.id)

        socket.on('message', (data) => {
            try {
                const request = ControlLayer.ControlMessage.deserialize(data)
                const handler = this.requestHandlersByMessageType[request.type]
                if (handler) {
                    debug('handleConnection: socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                    handler.call(this, connection, request)
                } else {
                    connection.sendError(`Unknown request type: ${request.type}`)
                }
            } catch (err) {
                connection.sendError(err.message || err)
            }
        })

        socket.on('close', () => {
            this.volumeLogger.connectionCount -= 1
            this.handleDisconnect(connection)
        })
    }

    handlePublishRequest(connection, request) {
        const streamId = request.getStreamId()
        this.streamFetcher.authenticate(streamId, request.apiKey, request.sessionToken, 'write')
            .then((stream) => {
                let streamPartition
                if (request.version === 0) {
                    streamPartition = this.publisher.getStreamPartition(stream, request.partitionKey)
                }
                this.publisher.publish(stream, request.getStreamMessage(streamPartition))
            })
            .catch((err) => {
                let errorMsg
                if (err instanceof HttpError && err.code === 401) {
                    errorMsg = `You are not allowed to write to stream ${request.streamId}`
                } else if (err instanceof HttpError && err.code === 403) {
                    errorMsg = `Authentication failed while trying to publish to stream ${request.streamId}`
                } else if (err instanceof HttpError && err.code === 404) {
                    errorMsg = `Stream ${request.streamId} not found.`
                } else {
                    errorMsg = `Publish request failed: ${err}`
                }

                connection.sendError(errorMsg)
            })
    }

    handleResendRequest(connection, request, resendTypeHandler) {
        let nothingToResend = true

        const msgHandler = (streamMessage) => {
            if (nothingToResend) {
                nothingToResend = false
                connection.send(ControlLayer.ResendResponseResending.create(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            }

            this.volumeLogger.logOutput(streamMessage.getContent().length)
            connection.send(ControlLayer.UnicastMessage.create(request.subId, streamMessage))
        }

        const doneHandler = () => {
            if (nothingToResend) {
                connection.send(ControlLayer.ResendResponseNoResend.create(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            } else {
                connection.send(ControlLayer.ResendResponseResent.create(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            }
        }

        this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken).then(() => {
            const streamingStorageData = resendTypeHandler()
            streamingStorageData.on('data', msgHandler)
            streamingStorageData.on('end', doneHandler)
        }).catch((err) => {
            connection.sendError(`Failed to request resend from stream ${
                request.streamId
            } and partition ${
                request.streamPartition
            }: ${err.message}`)
        })
    }

    handleResendLastRequest(connection, request) {
        this.handleResendRequest(connection, request, () => this.storage.fetchLatest(
            request.streamId,
            request.streamPartition,
            request.numberLast,
        ))
    }

    handleResendFromRequest(connection, request) {
        if (request.publisherId) {
            this.handleResendRequest(connection, request, () => this.storage.fetchFromMessageRefForPublisher(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef,
                request.publisherId,
                request.msgChainId,
            ))
        } else {
            this.handleResendRequest(connection, request, () => this.storage.fetchFromTimestamp(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
            ))
        }
    }

    handleResendRangeRequest(connection, request) {
        if (request.publisherId) {
            this.handleResendRequest(connection, request, () => this.storage.fetchBetweenMessageRefsForPublisher(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef,
                request.toMsgRef,
                request.publisherId,
                request.msgChainId,
            ))
        } else {
            this.handleResendRequest(connection, request, () => this.storage.fetchBetweenTimestamps(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
                request.toMsgRef.timestamp,
            ))
        }
    }

    /* eslint-disable class-methods-use-this */
    handleResendRequestV0(connection, request) {
        if (request.resendOptions.resend_last != null) {
            const requestV1 = ControlLayer.ResendLastRequest.create(
                request.streamId,
                request.streamPartition,
                request.subId,
                request.resendOptions.resend_last,
                request.sessionToken,
            )
            requestV1.apiKey = request.apiKey
            this.handleResendLastRequest(connection, requestV1)
        } else if (request.resendOptions.resend_from != null && request.resendOptions.resend_to != null) {
            const requestV1 = ControlLayer.ResendRangeRequest.create(
                request.streamId,
                request.streamPartition,
                request.subId,
                [request.resendOptions.resend_from, 0], // use offset as timestamp
                [request.resendOptions.resend_to, 0], // use offset as timestamp)
                null,
                null,
                request.sessionToken,
            )
            requestV1.apiKey = request.apiKey
            this.handleResendRangeRequest(connection, requestV1)
        } else if (request.resendOptions.resend_from != null) {
            const requestV1 = ControlLayer.ResendFromRequest.create(
                request.streamId,
                request.streamPartition,
                request.subId,
                [request.resendOptions.resend_from, 0], // use offset as timestamp
                null,
                null,
                request.sessionToken,
            )
            requestV1.apiKey = request.apiKey
            this.handleResendFromRequest(connection, requestV1)
        } else {
            debug('handleResendRequest: unknown resend request: %o', JSON.stringify(request))
            connection.sendError(`Unknown resend options: ${JSON.stringify(request.resendOptions)}`)
        }
    }

    broadcastMessage(streamId, streamPartition, timestamp, sequenceNo, publisherId, msgChainId, previousTimestamp, previousSequenceNo, payload, signatureType, signature) {
        const stream = this.streams.getStreamObject(streamId, streamPartition)

        if (stream) {
            const streamMessage = MessageLayer.StreamMessage.create(
                [
                    streamId,
                    streamPartition,
                    timestamp,
                    sequenceNo, // sequenceNumber
                    publisherId,
                    msgChainId,
                ],
                [previousTimestamp, previousSequenceNo],
                MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                payload,
                signatureType,
                signature,
            )

            stream.forEachConnection((connection) => {
                connection.send(ControlLayer.BroadcastMessage.create(streamMessage))
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    handleSubscribeRequest(connection, request) {
        this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken)
            .then((/* streamJson */) => {
                const stream = this.streams.getOrCreateStreamObject(request.streamId, request.streamPartition)

                // Subscribe now if the stream is not already subscribed or subscribing
                if (!stream.isSubscribed() && !stream.isSubscribing()) {
                    stream.setSubscribing()
                    this.networkNode.subscribe(request.streamId, request.streamPartition)
                    stream.setSubscribed()
                    stream.emit('subscribed')
                }

                const onSubscribe = () => {
                    stream.addConnection(connection)
                    connection.addStream(stream)
                    debug('handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"', connection.id, connection.streamsAsString())
                    connection.send(ControlLayer.SubscribeResponse.create(request.streamId, request.streamPartition))
                }

                const onError = (err) => {
                    connection.sendError(err)
                }

                if (stream.isSubscribed()) {
                    onSubscribe()
                } else {
                    stream.once('subscribed', (err) => {
                        if (err) {
                            onError(err)
                        } else {
                            onSubscribe()
                        }
                    })
                }
            })
            .catch((response) => {
                debug('handleSubscribeRequest: socket "%s" failed to subscribe to stream %s:%d because of "%o"', connection.id, request.streamId, request.streamPartition, response)
                connection.sendError(`Not authorized to subscribe to stream ${
                    request.streamId
                } and partition ${
                    request.streamPartition
                }`)
            })
    }

    handleUnsubscribeRequest(connection, request, noAck) {
        const stream = this.streams.getStreamObject(request.streamId, request.streamPartition)

        if (stream) {
            debug('handleUnsubscribeRequest: socket "%s" unsubscribing from stream "%s:%d"', connection.id,
                request.streamId, request.streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(request.streamId, request.streamPartition)

            debug('handleUnsubscribeRequest: socket "%s" is still subscribed to streams "%o"', connection.id, connection.streamsAsString())

            // Unsubscribe from stream if no connections left
            debug('checkRoomEmpty: "%d" sockets remaining on stream "%s:%d"', stream.getConnections().length, request.streamId, request.streamPartition)
            if (stream.getConnections().length === 0) {
                debug('checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.', request.streamId, request.streamPartition)
                this.networkNode.unsubscribe(request.streamId, request.streamPartition)
                this.streams.deleteStreamObject(request.streamId, request.streamPartition)
            }

            if (!noAck) {
                connection.send(ControlLayer.UnsubscribeResponse.create(request.streamId, request.streamPartition))
            }
        } else {
            debug('handleUnsubscribeRequest: stream "%s:%d" no longer exists', request.streamId, request.streamPartition)
            connection.sendError(`Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`)
        }
    }

    handleDisconnect(connection) {
        debug('handleDisconnect: socket "%s" is on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            this.handleUnsubscribeRequest(connection, ControlLayer.UnsubscribeRequest.create(stream.id, stream.partition), true)
        })
    }
}
