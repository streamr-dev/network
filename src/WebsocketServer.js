const events = require('events')
const debug = require('debug')('WebsocketServer')
const debugProtocol = require('debug')('WebsocketServer:protocol')
const Stream = require('./Stream')
const Connection = require('./Connection')
const TimestampUtil = require('./utils/TimestampUtil')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const HttpError = require('./errors/HttpError')
const VolumeLogger = require('./utils/VolumeLogger')

const DEFAULT_PARTITION = 0

function getStreamLookupKey(streamId, streamPartition) {
    return `${streamId}-${streamPartition}`
}

module.exports = class WebsocketServer extends events.EventEmitter {
    constructor(wss, realtimeAdapter, historicalAdapter, latestOffsetFetcher, streamFetcher, publisher, volumeLogger = new VolumeLogger(0)) {
        super()
        this.wss = wss
        this.realtimeAdapter = realtimeAdapter
        this.historicalAdapter = historicalAdapter
        this.latestOffsetFetcher = latestOffsetFetcher
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.volumeLogger = volumeLogger

        // This handler is for realtime messages, not resends
        this.realtimeAdapter.on('message', (messageAsArray, streamId, streamPartition) => {
            this.broadcastMessage(messageAsArray, streamId, streamPartition)
        })

        const requestHandlersByType = {
            subscribe: this.handleSubscribeRequest,
            unsubscribe: this.handleUnsubscribeRequest,
            resend: this.handleResendRequest,
            publish: this.handlePublishRequest,
        }

        this.wss.on('connection', (socket) => {
            debug('connection established: %o', socket)
            this.volumeLogger.connectionCount += 1

            const connection = new Connection(socket)

            socket.on('message', (data) => {
                try {
                    const request = JSON.parse(data)
                    const handler = requestHandlersByType[request.type]
                    if (!handler) {
                        throw new Error(`Unknown request type: ${request.type}`)
                    } else {
                        debugProtocol('%s: %s: %o', request.type, connection.id, request)
                        handler.call(this, connection, request)
                    }
                } catch (err) {
                    console.log('Error handling message: ', data)
                    console.log(err)
                    connection.sendError({
                        error: err,
                    })
                }
            })

            socket.on('close', () => {
                this.volumeLogger.connectionCount -= 1
                this.handleDisconnect(connection)
            })
        })

        this.streams = {}
    }

    handlePublishRequest(connection, req) {
        this.volumeLogger.inCount += 1

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
                undefined, // ttl, read from stream when available
                StreamrBinaryMessage.CONTENT_TYPE_JSON,
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
            this.volumeLogger.outCount += 1
            connection.sendUnicast(message, req.sub)
        }

        const sendResending = () => {
            debugProtocol('resending: %s: %o', connection.id, requestRef)
            connection.sendResending(requestRef)
        }

        const sendResent = () => {
            debugProtocol('resent: %s: %o', connection.id, requestRef)
            connection.sendResent(requestRef)
        }

        const sendNoResend = () => {
            debugProtocol('no_resend: %s: %o', connection.id, requestRef)
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

    /**
     * Creates and returns a Stream object, holding the Stream subscription state.
     *
     * In normal conditions, the Stream object is cleaned when no more
     * clients are subscribed to it.
     *
     * However, ill-behaving clients could just ask for resends on a Stream
     * and never subscribe to it, which would lead to leaking memory.
     * To prevent this, clean up the Stream object if it doesn't
     * end up in subscribed state within one minute (for example, ill-behaving)
     * clients only asking for resends and never subscribing.
     * */
    createStreamObject(streamId, streamPartition) {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = new Stream(streamId, streamPartition, 'init')
        this.streams[getStreamLookupKey(streamId, streamPartition)] = stream

        stream.stateTimeout = setTimeout(() => {
            if (stream.state !== 'subscribed') {
                debug('Stream %s never got to subscribed state, cleaning..', streamId)
                this.deleteStreamObject(streamId)
            }
        }, 60 * 1000)

        this.emit('stream-object-created', stream)
        debug('Stream object created: %o', stream)

        return stream
    }

    getStreamObject(streamId, streamPartition) {
        return this.streams[getStreamLookupKey(streamId, streamPartition)]
    }

    deleteStreamObject(streamId, streamPartition) {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = this.getStreamObject(streamId, streamPartition)
        debug('Stream object deleted: %o', stream)
        if (stream) {
            clearTimeout(stream.stateTimeout)
            delete this.streams[getStreamLookupKey(streamId, streamPartition)]
            this.emit('stream-object-deleted', stream)
        }
    }

    broadcastMessage(message, streamId, streamPartition) {
        const stream = this.getStreamObject(streamId, streamPartition)
        if (stream) {
            const connections = stream.getConnections()

            connections.forEach((connection) => {
                connection.sendBroadcast(message)
            })

            this.volumeLogger.outCount += connections.length
        }
    }

    handleSubscribeRequest(connection, request) {
        // Check that the request is valid
        if (!request.stream) {
            const response = {
                error: 'Error: stream id not defined. Are you using an outdated client?',
            }
            debugProtocol('subscribed (error): %s: %o', connection.id, response)
            connection.sendError(response)
        } else {
            const streamId = request.stream
            const streamPartition = request.partition || DEFAULT_PARTITION
            const requestRef = {
                stream: streamId, partition: streamPartition,
            }

            this.streamFetcher.authenticate(streamId, request.authKey)
                .then((/* streamJson */) => {
                    let stream = this.getStreamObject(streamId, streamPartition)

                    // Create Stream if it does not exist
                    if (!stream) {
                        stream = this.createStreamObject(streamId, streamPartition)
                    }

                    // Subscribe now if the stream is not already subscribed or subscribing
                    if (!(stream.state === 'subscribed' || stream.state === 'subscribing')) {
                        stream.state = 'subscribing'
                        this.realtimeAdapter.subscribe(streamId, streamPartition, (err) => {
                            if (err) {
                                stream.emit('subscribed', err)

                                // Delete the stream ref on subscribe error
                                this.deleteStreamObject(stream.id)

                                console.log(`Error subscribing to ${stream.id}: ${err}`)
                            } else {
                                stream.state = 'subscribed'
                                stream.emit('subscribed')
                            }
                        })
                    }

                    const onSubscribe = () => {
                        // Join the room
                        stream.addConnection(connection)
                        connection.addStream(stream)

                        debug('Socket %s is now subscribed to streams: %o', connection.id, connection.getStreams())
                        debugProtocol('subscribed: %s: %o', connection.id, requestRef)

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
                    if (stream.state === 'subscribed') {
                        onSubscribe()
                    }
                    // If the Stream is not yet subscribed, wait for the event
                    if (stream.state !== 'subscribed') {
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
                    debugProtocol('subscribed (error): %s: %o', connection.id, response)
                    connection.sendError(`Not authorized to subscribe to stream ${streamId} and partition ${streamPartition}`)
                })
        }
    }

    handleUnsubscribeRequest(connection, request, noAck) {
        const streamId = request.stream
        const streamPartition = request.partition || DEFAULT_PARTITION
        const stream = this.getStreamObject(streamId, streamPartition)

        if (stream) {
            debug('handleUnsubscribeRequest: socket %s unsubscribed from stream %s partition %d', connection.id, streamId, streamPartition)

            stream.removeConnection(connection)
            connection.removeStream(streamId, streamPartition)

            debug('handleUnsubscribeRequest: Socket %s is now subscribed to streams: %o', connection.id, connection.getStreams())

            /**
             * Check whether anyone is subscribed to the stream anymore
             */
            if (stream.getConnections().length) {
                debug('checkRoomEmpty: Clients remaining on %s partition %d: %d', streamId, streamPartition, stream.getConnections().length)
            } else {
                debug('checkRoomEmpty: stream %s partition %d has no clients remaining, unsubscribing realtimeAdapter...', streamId, streamPartition)
                this.realtimeAdapter.unsubscribe(streamId, streamPartition)
                this.deleteStreamObject(streamId, streamPartition)
            }

            if (!noAck) {
                connection.sendUnsubscribed({
                    stream: streamId, partition: streamPartition,
                })
            }
        } else {
            connection.sendError({
                error: 'Not subscribed', request,
            })
        }
    }

    handleDisconnect(connection) {
        debug('handleDisconnect: socket %s was on streams: %o', connection.id, connection.getStreams())

        const unsub = connection.getStreams()

        // Unsubscribe from all streams
        unsub.forEach((stream) => {
            this.handleUnsubscribeRequest(connection, {
                stream: stream.id, partition: stream.partition,
            }, true)
        })
    }
}
