const events = require('events')
const debug = require('debug')('streamr:WebsocketServer')
const Stream = require('./Stream')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const Connection = require('./Connection')
const StreamStateManager = require('./StreamStateManager')
const TimestampUtil = require('./utils/TimestampUtil')
const HttpError = require('./errors/HttpError')
const VolumeLogger = require('./utils/VolumeLogger')

const DEFAULT_PARTITION = 0

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

        this.requestHandlersByType = {
            subscribe: this.handleSubscribeRequest,
            unsubscribe: this.handleUnsubscribeRequest,
            resend: this.handleResendRequest,
            publish: this.handlePublishRequest,
        }

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))

        this.wss.on('connection', this.handleConnection.bind(this))
    }

    handleConnection(socket) {
        const connection = new Connection(socket)
        this.volumeLogger.connectionCount += 1
        debug('handleConnection: socket "%s" connected', connection.id)

        socket.on('message', (data) => {
            const request = JSON.parse(data)
            const handler = this.requestHandlersByType[request.type]
            if (handler) {
                debug('handleConnection: socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                handler.call(this, connection, request)
            } else {
                console.log(`Error handling message ${data} because of unknown request type ${request.type}`)
                connection.sendError({
                    error: `Unknown request type ${request.type}`,
                })
            }
        })

        socket.on('close', () => {
            this.volumeLogger.connectionCount -= 1
            this.handleDisconnect(connection)
        })
    }

    handlePublishRequest(connection, req) {
        if (!req.stream) {
            connection.sendError('Publish request is missing the stream id!')
            return
        }

        // Read timestamp if given
        let timestamp
        if (req.ts) {
            try {
                timestamp = TimestampUtil.parse(req.ts)
            } catch (err) {
                connection.sendError(`Invalid timestamp: ${req.ts}`)
                return
            }
        }

        // Check that the payload is a string
        if (typeof req.msg !== 'string') {
            connection.sendError('Message must be stringified JSON!')
            return
        }

        this.streamFetcher.authenticate(req.stream, req.authKey, 'write')
            .then((stream) => this.publisher.publish(
                stream,
                timestamp,
                req.msg,
                req.pkey,
            ))
            .catch((err) => {
                let errorMsg
                if (err instanceof HttpError && err.code === 401) {
                    errorMsg = `You are not allowed to write to stream ${req.stream}`
                } else if (err instanceof HttpError && err.code === 403) {
                    errorMsg = `Authentication failed while trying to publish to stream ${req.stream}`
                } else if (err instanceof HttpError && err.code === 404) {
                    errorMsg = `Stream ${req.stream} not found.`
                } else {
                    errorMsg = `Publish request failed: ${err}`
                }

                connection.sendError(errorMsg)
            })
    }

    handleResendRequest(connection, req) {
        const streamId = req.stream
        const streamPartition = req.partition || DEFAULT_PARTITION
        const authkey = req.authKey

        const requestRef = {
            stream: streamId, partition: streamPartition, sub: req.sub,
        }

        const sendMessage = (message) => {
            // "broadcast" to the socket of this connection (ie. this single client) and specific subscription id
            this.volumeLogger.logOutput(StreamrBinaryMessage.calculatePayloadBytesForArray(message))
            connection.sendUnicast(message, req.sub)
        }

        const sendResending = () => {
            //debugProtocol('resending: %s: %o', connection.id, requestRef) TODO: fix
            connection.sendResending(requestRef)
        }

        const sendResent = () => {
            //debugProtocol('resent: %s: %o', connection.id, requestRef) TODO: fix
            connection.sendResent(requestRef)
        }

        const sendNoResend = () => {
            //debugProtocol('no_resend: %s: %o', connection.id, requestRef) TODO: fix
            connection.sendNoResend(requestRef)
        }

        let nothingToResend = true

        const msgHandler = (msg) => {
            if (nothingToResend) {
                nothingToResend = false
                sendResending()
            }
            sendMessage(msg.toArray())
        }

        const doneHandler = () => {
            if (nothingToResend) {
                sendNoResend()
            } else {
                sendResent()
            }
        }

        Promise.all([
            this.streamFetcher.authenticate(streamId, authkey),
            this.latestOffsetFetcher.fetchOffset(streamId, streamPartition),
        ]).then((results) => {
            const latestKnownOffset = results[1]

            if (req.resend_all === true) {
                // Resend all
                this.historicalAdapter.getAll(streamId, streamPartition, msgHandler, doneHandler, latestKnownOffset)
            } else if (req.resend_from != null && req.resend_to != null) {
                // Resend range
                this.historicalAdapter.getOffsetRange(
                    streamId, streamPartition, req.resend_from, req.resend_to,
                    msgHandler, doneHandler, latestKnownOffset,
                )
            } else if (req.resend_from != null) {
                // Resend from a given offset
                this.historicalAdapter.getFromOffset(streamId, streamPartition, req.resend_from, msgHandler, doneHandler, latestKnownOffset)
            } else if (req.resend_last != null) {
                // Resend the last N messages
                this.historicalAdapter.getLast(streamId, streamPartition, req.resend_last, msgHandler, doneHandler, latestKnownOffset)
            } else if (req.resend_from_time != null) {
                // Resend from a given time
                this.historicalAdapter.getFromTimestamp(streamId, streamPartition, req.resend_from_time, msgHandler, doneHandler)
            } else {
                debug('handleResendRequest: unknown resend request: %o', req)
                sendNoResend()
            }
        }).catch((err) => {
            connection.sendError(`Failed to request resend from stream ${streamId} and partition ${streamPartition}: ${err.message}`)
        })
    }

    broadcastMessage(streamId, streamPartition, message, number, previousNumber) {
        const stream = this.streams.getStreamObject(streamId, streamPartition)

        // TODO: do in a better way
        message[5] = number
        message[6] = previousNumber

        if (stream) {
            stream.forEachConnection((connection) => {
                connection.sendBroadcast(message)
            })

            this.volumeLogger.logOutput(StreamrBinaryMessage.calculatePayloadBytesForArray(message) * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    handleSubscribeRequest(connection, request) {
        // Check that the request is valid
        if (!request.stream) {
            const response = {
                error: 'Error: stream id not defined. Are you using an outdated client?',
            }
            connection.sendError(response)
        } else {
            const streamId = request.stream
            const streamPartition = request.partition || DEFAULT_PARTITION
            const requestRef = {
                stream: streamId, partition: streamPartition,
            }

            this.streamFetcher.authenticate(streamId, request.authKey)
                .then(() => {
                    const stream = this.streams.getOrCreateStreamObject(streamId, streamPartition)

                    // Subscribe now if the stream is not already subscribed or subscribing
                    if (!stream.isSubscribed() && !stream.isSubscribing()) {
                        stream.setSubscribing()
                        this.networkNode.subscribe(streamId, streamPartition, (err) => {
                            if (err) {
                                stream.emit('subscribed', err)

                                // Delete the stream ref on subscribe error
                                this.streams.deleteStreamObject(stream.id)

                                console.error(`Error subscribing to ${stream.id}: ${err}`)
                            } else {
                                stream.setSubscribed()
                                stream.emit('subscribed')
                            }
                        })
                    }

                    const onSubscribe = () => {
                        // Join the room
                        stream.addConnection(connection)
                        connection.addStream(stream)
                        debug('handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"', connection.id, connection.streamsAsString())
                        connection.sendSubscribed(requestRef)
                    }

                    const onError = (err) => {
                        connection.sendSubscribed({
                            stream: streamId,
                            partition: streamPartition,
                            error: err,
                        })
                    }

                    // If the Stream is subscribed, we're good to go
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
                    debug('handleSubscribeRequest: socket "%s" failed to subscribe to "%o" because of "%o"', connection.id, requestRef, response)
                    connection.sendError(`Not authorized to subscribe to stream ${streamId} and partition ${streamPartition}`)
                })
        }
    }

    handleUnsubscribeRequest(connection, request, noAck) {
        const streamId = request.stream
        const streamPartition = request.partition || DEFAULT_PARTITION
        const stream = this.streams.getStreamObject(streamId, streamPartition)

        if (stream) {
            debug('handleUnsubscribeRequest: socket "%s" unsubscribing from stream "%s:%d"', connection.id, streamId, streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(streamId, streamPartition)

            debug('handleUnsubscribeRequest: socket "%s" is still subscribed to streams "%o"', connection.id, connection.streamsAsString())

            // Unsubscribe from stream if no connections left
            debug('checkRoomEmpty: "%d" sockets remaining on stream "%s:%d"', stream.getConnections().length, streamId, streamPartition)
            if (stream.getConnections().length === 0) {
                debug('checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.', streamId, streamPartition)
                this.networkNode.unsubscribe(streamId, streamPartition)
                this.streams.deleteStreamObject(streamId, streamPartition)
            }

            if (!noAck) {
                connection.sendUnsubscribed({
                    stream: streamId, partition: streamPartition,
                })
            }
        } else {
            debug('handleUnsubscribeRequest: stream "%s:%d" no longer exists', streamId, streamPartition)
            connection.sendError({
                error: 'Not subscribed', request,
            })
        }
    }

    handleDisconnect(connection) {
        debug('handleDisconnect: socket "%s" is on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            this.handleUnsubscribeRequest(connection, {
                stream: stream.id,
                partition: stream.partition,
            }, true)
        })
    }
}
