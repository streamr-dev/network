const events = require('events')

const debug = require('debug')('streamr:WebsocketServer')
const { ControlLayer } = require('streamr-client-protocol')

const HttpError = require('../errors/HttpError')
const VolumeLogger = require('../VolumeLogger')
const partition = require('../partition')
const StreamStateManager = require('../StreamStateManager')

const Connection = require('./Connection')
const FieldDetector = require('./FieldDetector')

module.exports = class WebsocketServer extends events.EventEmitter {
    constructor(
        wss,
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger = new VolumeLogger(0),
        subscriptionManager,
        partitionFn = partition,
    ) {
        super()
        this.wss = wss
        this.networkNode = networkNode
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.partitionFn = partitionFn
        this.volumeLogger = volumeLogger
        this.streams = new StreamStateManager()
        this.fieldDetector = new FieldDetector(streamFetcher)
        this.subscriptionManager = subscriptionManager

        this.requestHandlersByMessageType = {
            [ControlLayer.SubscribeRequest.TYPE]: this.handleSubscribeRequest,
            [ControlLayer.UnsubscribeRequest.TYPE]: this.handleUnsubscribeRequest,
            [ControlLayer.ResendRequestV0.TYPE]: this.handleResendRequestV0,
            [ControlLayer.ResendLastRequestV1.TYPE]: this.handleResendLastRequest,
            [ControlLayer.ResendFromRequestV1.TYPE]: this.handleResendFromRequest,
            [ControlLayer.ResendRangeRequestV1.TYPE]: this.handleResendRangeRequest,
            [ControlLayer.PublishRequest.TYPE]: this.handlePublishRequest,
        }

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))

        this.wss.on('connection', this.onNewClientConnection.bind(this))
    }

    close() {
        this.streams.close()
        this.wss.clients.forEach((socket) => socket.terminate())
        return new Promise((resolve, reject) => {
            this.wss.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    onNewClientConnection(socket, socketRequest) {
        const connection = new Connection(socket, socketRequest)
        this.volumeLogger.connectionCount += 1
        debug('onNewClientConnection: socket "%s" connected', connection.id)

        // Callback for when client sends message
        socket.on('message', (data) => {
            try {
                const request = ControlLayer.ControlMessage.deserialize(data)
                const handler = this.requestHandlersByMessageType[request.type]
                if (handler) {
                    debug('socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                    handler.call(this, connection, request)
                } else {
                    connection.sendError(`Unknown request type: ${request.type}`)
                }
            } catch (err) {
                connection.sendError(err.message || err)
            }
        })

        // Callback for when client disconnects
        socket.on('close', () => {
            this.volumeLogger.connectionCount -= 1
            debug('closing socket "%s" on streams "%o"', connection.id, connection.streamsAsString())

            // Unsubscribe from all streams
            connection.forEachStream((stream) => {
                this.handleUnsubscribeRequest(
                    connection,
                    ControlLayer.UnsubscribeRequest.create(stream.id, stream.partition),
                    true,
                )
            })
        })
    }

    handlePublishRequest(connection, request) {
        const streamId = request.getStreamId()
        // TODO: should this be moved to streamr-client-protocol-js ?
        if (streamId === undefined) {
            connection.sendError('Publish request failed: Error: streamId must be defined!')
            return
        }
        // TODO: simplify with async-await
        this.streamFetcher.authenticate(streamId, request.apiKey, request.sessionToken, 'write')
            .then((stream) => {
                // TODO: should this be moved to streamr-client-protocol-js ?
                let streamPartition
                if (request.version === 0) {
                    streamPartition = this.partitionFn(stream.partitions, request.partitionKey)
                }
                const streamMessage = request.getStreamMessage(streamPartition)
                this.fieldDetector.detectAndSetFields(stream, streamMessage, request.apiKey, request.sessionToken)
                this.publisher.publish(stream, streamMessage)
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

    // TODO: Extract resend stuff to class?
    handleResendRequest(connection, request, resendTypeHandler) {
        let nothingToResend = true

        const msgHandler = (unicastMessage) => {
            if (nothingToResend) {
                nothingToResend = false
                connection.send(ControlLayer.ResendResponseResending.create(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            }

            const { streamMessage } = unicastMessage
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

        // TODO: simplify with async-await
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
        this.handleResendRequest(connection, request, () => this.networkNode.requestResendLast(
            request.streamId,
            request.streamPartition,
            request.subId, // TODO: should generate new here or use client-provided as is?
            request.numberLast,
        ))
    }

    handleResendFromRequest(connection, request) {
        this.handleResendRequest(connection, request, () => this.networkNode.requestResendFrom(
            request.streamId,
            request.streamPartition,
            request.subId, // TODO: should generate new here or use client-provided as is?
            request.fromMsgRef.timestamp,
            request.fromMsgRef.sequenceNumber,
            request.publisherId,
            request.msgChainId,
        ))
    }

    handleResendRangeRequest(connection, request) {
        this.handleResendRequest(connection, request, () => this.networkNode.requestResendRange(
            request.streamId,
            request.streamPartition,
            request.subId, // TODO: should generate new here or use client-provided as is?
            request.fromMsgRef.timestamp,
            request.fromMsgRef.sequenceNumber,
            request.toMsgRef.timestamp,
            request.toMsgRef.sequenceNumber,
            request.publisherId,
            request.msgChainId,
        ))
    }

    // TODO: should this be moved to streamr-client-protocol-js ?
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

    broadcastMessage(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, streamPartition)

        if (stream) {
            stream.forEachConnection((connection) => {
                // TODO: performance fix, no need to re-create on every loop iteration
                connection.send(ControlLayer.BroadcastMessage.create(streamMessage))
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    handleSubscribeRequest(connection, request) {
        // TODO: simplify with async-await
        this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken)
            .then((/* streamJson */) => {
                const stream = this.streams.getOrCreate(request.streamId, request.streamPartition)

                // Subscribe now if the stream is not already subscribed or subscribing
                if (!stream.isSubscribed() && !stream.isSubscribing()) {
                    stream.setSubscribing()
                    this.subscriptionManager.subscribe(request.streamId, request.streamPartition)
                    stream.setSubscribed()
                }

                stream.addConnection(connection)
                connection.addStream(stream)
                debug(
                    'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
                    connection.id, connection.streamsAsString()
                )
                connection.send(ControlLayer.SubscribeResponse.create(request.streamId, request.streamPartition))
            })
            .catch((response) => {
                debug(
                    'handleSubscribeRequest: socket "%s" failed to subscribe to stream %s:%d because of "%o"',
                    connection.id, request.streamId, request.streamPartition, response
                )
                connection.sendError(`Not authorized to subscribe to stream ${
                    request.streamId
                } and partition ${
                    request.streamPartition
                }`)
            })
    }

    handleUnsubscribeRequest(connection, request, noAck) {
        const stream = this.streams.get(request.streamId, request.streamPartition)

        if (stream) {
            debug('handleUnsubscribeRequest: socket "%s" unsubscribing from stream "%s:%d"', connection.id,
                request.streamId, request.streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(request.streamId, request.streamPartition)

            debug(
                'handleUnsubscribeRequest: socket "%s" is still subscribed to streams "%o"',
                connection.id, connection.streamsAsString()
            )

            // Unsubscribe from stream if no connections left
            debug(
                'checkRoomEmpty: "%d" sockets remaining on stream "%s:%d"',
                stream.getConnections().length, request.streamId, request.streamPartition
            )
            if (stream.getConnections().length === 0) {
                debug(
                    'checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.',
                    request.streamId, request.streamPartition
                )
                this.subscriptionManager.unsubscribe(request.streamId, request.streamPartition)
                this.streams.delete(request.streamId, request.streamPartition)
            }

            if (!noAck) {
                connection.send(ControlLayer.UnsubscribeResponse.create(request.streamId, request.streamPartition))
            }
        } else {
            debug(
                'handleUnsubscribeRequest: stream "%s:%d" no longer exists',
                request.streamId, request.streamPartition
            )
            connection.sendError(`Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`)
        }
    }
}
