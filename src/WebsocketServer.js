const events = require('events')
const debug = require('debug')('streamr:WebsocketServer')
const Protocol = require('streamr-client-protocol')

const Stream = require('./Stream')
const Connection = require('./Connection')
const StreamStateManager = require('./StreamStateManager')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const HttpError = require('./errors/HttpError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class WebsocketServer extends events.EventEmitter {
    constructor(wss, networkNode, historicalAdapter, latestOffsetFetcher, streamFetcher, publisher, volumeLogger = new VolumeLogger(0)) {
        super()
        this.wss = wss
        this.networkNode = networkNode
        this.historicalAdapter = historicalAdapter
        this.latestOffsetFetcher = latestOffsetFetcher
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.volumeLogger = volumeLogger
        this.streams = new StreamStateManager()

        this.requestHandlersByMessage = {
            SubscribeRequest: this.handleSubscribeRequest,
            UnsubscribeRequest: this.handleUnsubscribeRequest,
            ResendRequest: this.handleResendRequest,
            PublishRequest: this.handlePublishRequest,
        }

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))

        this.wss.on('connection', this.handleConnection.bind(this))
    }

    handleConnection(socket) {
        const connection = new Connection(socket)
        this.volumeLogger.connectionCount += 1
        debug('handleConnection: socket "%s" connected', connection.id)

        socket.on('message', (data) => {
            try {
                const request = Protocol.WebsocketRequest.deserialize(data)
                const handler = this.requestHandlersByMessage[request.constructor.name]
                if (handler) {
                    debug('handleConnection: socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                    handler.call(this, connection, request)
                } else {
                    throw new Error(`Unknown request type: ${request.type}`)
                }
            } catch (err) {
                connection.send(new Protocol.ErrorResponse(err.message || err))
            }
        })

        socket.on('close', () => {
            this.volumeLogger.connectionCount -= 1
            this.handleDisconnect(connection)
        })
    }

    handlePublishRequest(connection, request) {
        // Check that the payload is a string
        if (typeof request.content !== 'string') {
            connection.send(new Protocol.ErrorResponse('Message must be stringified JSON!'))
            return
        }

        this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken, 'write')
            .then((stream) => this.publisher.publish(
                stream,
                request.timestamp,
                request.content,
                request.partitionKey,
                request.signatureType,
                request.publisherAddress,
                request.signature,
            ))
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

                connection.send(new Protocol.ErrorResponse(errorMsg))
            })
    }

    handleResendRequest(connection, request) {
        let nothingToResend = true

        const msgHandler = (streamMessage) => {
            if (nothingToResend) {
                nothingToResend = false
                connection.send(new Protocol.ResendResponseResending(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            }

            this.volumeLogger.logOutput(streamMessage.content.length)
            connection.send(new Protocol.UnicastMessage(streamMessage, request.subId))
        }

        const doneHandler = () => {
            if (nothingToResend) {
                connection.send(new Protocol.ResendResponseNoResend(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            } else {
                connection.send(new Protocol.ResendResponseResent(
                    request.streamId,
                    request.streamPartition,
                    request.subId,
                ))
            }
        }

        Promise.all([
            this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken),
            this.latestOffsetFetcher.fetchOffset(request.streamId, request.streamPartition),
        ]).then((results) => {
            const latestKnownOffset = results[1]

            if (request.resendOptions.resend_all === true) {
                // Resend all
                this.historicalAdapter.getAll(request.streamId, request.streamPartition, msgHandler, doneHandler, latestKnownOffset)
            } else if (request.resendOptions.resend_from != null && request.resendOptions.resend_to != null) {
                // Resend range
                this.historicalAdapter.getOffsetRange(
                    request.streamId, request.streamPartition, request.resendOptions.resend_from, request.resendOptions.resend_to,
                    msgHandler, doneHandler, latestKnownOffset,
                )
            } else if (request.resendOptions.resend_from != null) {
                // Resend from a given offset
                this.historicalAdapter.getFromOffset(
                    request.streamId,
                    request.streamPartition,
                    request.resendOptions.resend_from,
                    msgHandler,
                    doneHandler,
                    latestKnownOffset,
                )
            } else if (request.resendOptions.resend_last != null) {
                // Resend the last N messages
                this.historicalAdapter.getLast(
                    request.streamId,
                    request.streamPartition,
                    request.resendOptions.resend_last,
                    msgHandler,
                    doneHandler,
                    latestKnownOffset,
                )
            } else if (request.resendOptions.resend_from_time != null) {
                // Resend from a given time
                this.historicalAdapter.getFromTimestamp(
                    request.streamId,
                    request.streamPartition,
                    request.resendOptions.resend_from_time,
                    msgHandler,
                    doneHandler,
                )
            } else {
                debug('handleResendRequest: unknown resend request: %o', JSON.stringify(request))
                connection.send(new Protocol.ErrorResponse(`Unknown resend options: ${JSON.stringify(request.resendOptions)}`))
            }
        }).catch((err) => {
            connection.send(new Protocol.ErrorResponse(`Failed to request resend from stream ${
                request.streamId
            } and partition ${
                request.streamPartition
            }: ${err.message}`))
        })
    }

    broadcastMessage(streamId, streamPartition, timestamp, sequenceNo, publisherId, prevTimestamp, prevSequenceNo, message) {
        const stream = this.streams.getStreamObject(streamId, streamPartition)

        // TODO: do in a better way
        message[5] = timestamp
        message[6] = prevTimestamp

        if (stream) {
            connections.forEachConnection((connection) => {
                connection.send(new Protocol.BroadcastMessage(streamMessage)) // TODO: instantiate streamMessage
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * connections.length)
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
                    connection.send(new Protocol.SubscribeResponse(request.streamId, request.streamPartition))
                }

                const onError = (err) => {
                    connection.send(new Protocol.ErrorResponse(err))
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
                connection.send(new Protocol.ErrorResponse(`Not authorized to subscribe to stream ${
                    request.streamId
                } and partition ${
                    request.streamPartition
                }`))
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
                debug('checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.', request.streamId, requset.streamPartition)
                this.networkNode.unsubscribe(request.streamId, request.streamPartition)
                this.streams.deleteStreamObject(request.streamId, request.streamPartition)
            }

            if (!noAck) {
                connection.send(new Protocol.UnsubscribeResponse(request.streamId, request.streamPartition))
            }
        } else {
            debug('handleUnsubscribeRequest: stream "%s:%d" no longer exists', request.streamId, request.streamPartition)
            connection.send(new Protocol.ErrorResponse(`Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`))
        }
    }

    handleDisconnect(connection) {
        debug('handleDisconnect: socket "%s" is on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            this.handleUnsubscribeRequest(connection, new Protocol.UnsubscribeRequest(stream.id, stream.partition), true)
        })
    }
}
