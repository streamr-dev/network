const { EventEmitter } = require('events')

const { v4: uuidv4 } = require('uuid')
const debug = require('debug')('streamr:WebsocketServer')
const { ControlLayer, Utils } = require('streamr-network').Protocol
const ab2str = require('arraybuffer-to-string')
const uWS = require('uWebSockets.js')

const HttpError = require('../errors/HttpError')
const FailedToPublishError = require('../errors/FailedToPublishError')
const VolumeLogger = require('../VolumeLogger')
const partition = require('../helpers/partition')
const StreamStateManager = require('../StreamStateManager')

const Connection = require('./Connection')
const FieldDetector = require('./FieldDetector')

module.exports = class WebsocketServer extends EventEmitter {
    constructor(
        wss,
        port,
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger = new VolumeLogger(0),
        subscriptionManager,
        pingInterval = 60 * 1000,
    ) {
        super()
        this.wss = wss
        this._listenSocket = null
        this.networkNode = networkNode
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.volumeLogger = volumeLogger
        this.connections = new Map()
        this.streams = new StreamStateManager(
            this._broadcastMessage.bind(this),
            (streamId, streamPartition, from, to, publisherId, msgChainId) => {
                this.networkNode.requestResendRange(
                    streamId,
                    streamPartition,
                    uuidv4(),
                    from.timestamp,
                    from.sequenceNumber,
                    to.timestamp,
                    to.sequenceNumber,
                    publisherId,
                    msgChainId
                ).on('data', (unicastMessage) => {
                    this._handleStreamMessage(unicastMessage.streamMessage)
                })
            }
        )

        this.pingInterval = pingInterval
        this.fieldDetector = new FieldDetector(streamFetcher)
        this.subscriptionManager = subscriptionManager

        this.requestHandlersByMessageType = {
            [ControlLayer.ControlMessage.TYPES.SubscribeRequest]: this.handleSubscribeRequest,
            [ControlLayer.ControlMessage.TYPES.UnsubscribeRequest]: this.handleUnsubscribeRequest,
            [ControlLayer.ControlMessage.TYPES.ResendLastRequest]: this.handleResendLastRequest,
            [ControlLayer.ControlMessage.TYPES.ResendFromRequest]: this.handleResendFromRequest,
            [ControlLayer.ControlMessage.TYPES.ResendRangeRequest]: this.handleResendRangeRequest,
            [ControlLayer.ControlMessage.TYPES.PublishRequest]: this.handlePublishRequest,
        }

        this.networkNode.addMessageListener(this._handleStreamMessage.bind(this))

        this._updateTotalBufferSizeInterval = setInterval(() => {
            let totalBufferSize = 0
            this.connections.forEach((id, connection) => {
                if (connection.socket) {
                    totalBufferSize += connection.socket.getBufferedAmount()
                }
            })
            this.volumeLogger.totalBufferSize = totalBufferSize
        }, 1000)

        this._pingInterval = setInterval(() => {
            this._pingConnections()
        }, this.pingInterval)

        this.wss.listen(port, (token) => {
            if (token) {
                this._listenSocket = token
                console.log('WS adapter listening on ' + port)
            } else {
                console.log('Failed to listen to port ' + port)
                this.close()
            }
        })

        this.wss.ws('/api/v1/ws', {
            /* Options */
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            idleTimeout: 3600, // 1 hour
            upgrade: (res, req, context) => {
                /* This immediately calls open handler, you must not use res after this call */
                res.upgrade({
                    query: req.getQuery()
                },
                /* Spell these correctly */
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context)
            },
            open: (ws) => {
                const connection = new Connection(ws, ws.query)
                this.connections.set(connection.id, connection)
                this.volumeLogger.connectionCountWS = this.connections.size
                debug('onNewClientConnection: socket "%s" connected', connection.id)
                // eslint-disable-next-line no-param-reassign
                ws.connectionId = connection.id

                connection.on('forceClose', (err) => {
                    try {
                        connection.socket.close()
                    } catch (e) {
                        // no need to check this error
                    } finally {
                        console.warn('forceClose connection with id %s, because of %s', connection.id, err)
                        this._removeConnection(connection)
                    }
                })
            },
            message: (ws, message, isBinary) => {
                const connection = this.connections.get(ws.connectionId)

                if (connection) {
                    const copy = (src) => {
                        const dst = new ArrayBuffer(src.byteLength)
                        new Uint8Array(dst).set(new Uint8Array(src))
                        return dst
                    }

                    const msg = copy(message)

                    setImmediate(() => {
                        if (connection.isDead()) {
                            return
                        }

                        let request
                        try {
                            request = ControlLayer.ControlMessage.deserialize(ab2str(msg), false)
                        } catch (err) {
                            connection.send(new ControlLayer.ErrorResponse({
                                requestId: '', // Can't echo the requestId of the request since parsing the request failed
                                errorMessage: err.message || err,
                                errorCode: 'INVALID_REQUEST',
                            }))
                        }

                        try {
                            const handler = this.requestHandlersByMessageType[request.type]
                            if (handler) {
                                debug('socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                                handler.call(this, connection, request)
                            } else {
                                connection.send(new ControlLayer.ErrorResponse({
                                    version: request.version,
                                    requestId: request.requestId,
                                    errorMessage: `Unknown request type: ${request.type}`,
                                    errorCode: 'INVALID_REQUEST',
                                }))
                            }
                        } catch (err) {
                            connection.send(new ControlLayer.ErrorResponse({
                                version: request.version,
                                requestId: request.requestId,
                                errorMessage: err.message || err,
                                errorCode: err.errorCode || 'ERROR_WHILE_HANDLING_REQUEST',
                            }))
                        }
                    })
                }
            },
            drain: (ws) => {
                console.log('WebSocket backpressure: ' + ws.getBufferedAmount())
            },
            close: (ws, code, message) => {
                const connection = this.connections.get(ws.connectionId)

                if (connection) {
                    debug('closing socket "%s" on streams "%o"', connection.id, connection.streamsAsString())
                    this._removeConnection(connection)
                } else {
                    console.warn('failed to close websocket, because connection with id %s not found', ws.connectionId)
                }
            },
            pong: (ws) => {
                const connection = this.connections.get(ws.connectionId)

                if (connection) {
                    debug(`received from ${connection.id} "pong" frame`)
                    connection.respondedPong = true
                }
            }
        })
    }

    _removeConnection(connection) {
        this.connections.delete(connection.id)
        this.volumeLogger.connectionCountWS = this.connections.size

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            // for cleanup, spoof an UnsubscribeRequest to ourselves on the removed connection
            this.handleUnsubscribeRequest(
                connection,
                new ControlLayer.UnsubscribeRequest({
                    requestId: uuidv4(),
                    streamId: stream.id,
                    streamPartition: stream.partition,
                }),
                true,
            )
        })

        // Cancel all resends
        connection.getOngoingResends().forEach((resend) => {
            resend.destroy()
        })

        connection.markAsDead()
    }

    close() {
        clearInterval(this._updateTotalBufferSizeInterval)
        clearInterval(this._pingInterval)

        this.streams.close()

        return new Promise((resolve, reject) => {
            try {
                this.connections.forEach((connection) => connection.socket.close())
            } catch (e) {
                // ignoring any error
            }

            if (this._listenSocket) {
                uWS.us_listen_socket_close(this._listenSocket)
                this._listenSocket = null
            }

            setTimeout(() => resolve(), 100)
        })
    }

    async handlePublishRequest(connection, request) {
        const { streamMessage } = request

        try {
            // Legacy validation: for unsigned messages, we additionally need to do an authenticated check of publish permission
            // This can be removed when support for unsigned messages is dropped!
            if (!streamMessage.signature) {
                // checkPermission is cached
                await this.streamFetcher.checkPermission(request.streamMessage.getStreamId(), request.apiKey, request.sessionToken, 'stream_publish')
            }

            await this.publisher.validateAndPublish(streamMessage)

            // TODO later: should be moved to client, as this is an authenticated call
            if (!Utils.StreamMessageValidator.isKeyExchangeStream(request.streamMessage.getStreamId())) {
                this.fieldDetector.detectAndSetFields(streamMessage, request.apiKey, request.sessionToken)
                    .catch((err) => {
                        console.error(`detectAndSetFields request failed: ${err}`)
                    })
            }
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
                errorCode,
            }))
        }
    }

    // TODO: Extract resend stuff to class?
    async handleResendRequest(connection, request, resendTypeHandler) {
        let nothingToResend = true

        const msgHandler = (unicastMessage) => {
            if (nothingToResend) {
                nothingToResend = false
                connection.send(new ControlLayer.ResendResponseResending(request))
            }

            const { streamMessage } = unicastMessage
            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length)
            connection.send(new ControlLayer.UnicastMessage({
                version: request.version,
                requestId: request.requestId,
                streamMessage,
            }))
        }

        const doneHandler = () => {
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
            connection.addOngoingResend(streamingStorageData)
            streamingStorageData.on('data', msgHandler)
            streamingStorageData.on('end', doneHandler)
            streamingStorageData.once('end', () => {
                connection.removeOngoingResend(streamingStorageData)
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

    async handleResendLastRequest(connection, request) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendLast(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.numberLast,
        ))
    }

    async handleResendFromRequest(connection, request) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendFrom(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.fromMsgRef.timestamp,
            request.fromMsgRef.sequenceNumber,
            request.publisherId,
            request.msgChainId,
        ))
    }

    async handleResendRangeRequest(connection, request) {
        await this.handleResendRequest(connection, request, () => this.networkNode.requestResendRange(
            request.streamId,
            request.streamPartition,
            uuidv4(),
            request.fromMsgRef.timestamp,
            request.fromMsgRef.sequenceNumber,
            request.toMsgRef.timestamp,
            request.toMsgRef.sequenceNumber,
            request.publisherId,
            request.msgChainId,
        ))
    }

    _broadcastMessage(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, streamPartition)

        if (stream) {
            stream.forEachConnection((connection) => {
                connection.send(new ControlLayer.BroadcastMessage({
                    requestId: '', // TODO: can we have here the requestId of the original SubscribeRequest?
                    streamMessage,
                }))
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    _pingConnections() {
        const connections = [...this.connections.values()]
        connections.forEach((connection) => {
            try {
                // didn't get "pong" in pingInterval
                if (connection.respondedPong !== undefined && !connection.respondedPong) {
                    throw Error('Connection is not active')
                }

                // eslint-disable-next-line no-param-reassign
                connection.respondedPong = false
                connection.ping()
                debug(`pinging ${connection.id}`)
            } catch (e) {
                console.error(`Failed to ping connection: ${connection.id}, error ${e}`)
                connection.emit('forceClose')
            }
        })
    }

    _handleStreamMessage(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, streamPartition)
        if (stream) {
            setImmediate(() => stream.passToOrderingUtil(streamMessage), 0)
        } else {
            debug('_handleStreamMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    async _validateSubscribeOrResendRequest(request) {
        if (Utils.StreamMessageValidator.isKeyExchangeStream(request.streamId)) {
            if (request.streamPartition !== 0) {
                throw new Error(`Key exchange streams only have partition 0. Tried to subscribe to ${request.streamId}:${request.streamPartition}`)
            }
        } else {
            await this.streamFetcher.checkPermission(request.streamId, request.apiKey, request.sessionToken, 'stream_subscribe')
        }
    }

    async handleSubscribeRequest(connection, request) {
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
            debug(
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
            debug(
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
                errorCode,
            }))
        }
    }

    handleUnsubscribeRequest(connection, request, noAck = false) {
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
                connection.send(new ControlLayer.UnsubscribeResponse({
                    version: request.version,
                    requestId: request.requestId,
                    streamId: request.streamId,
                    streamPartition: request.streamPartition
                }))
            }
        } else {
            debug(
                'handleUnsubscribeRequest: stream "%s:%d" no longer exists',
                request.streamId, request.streamPartition
            )
            if (!noAck) {
                connection.send(new ControlLayer.ErrorResponse({
                    version: request.version,
                    requestId: request.requestId,
                    errorMessage: `Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`,
                    errorCode: 'INVALID_REQUEST',
                }))
            }
        }
    }
}
