const events = require('events')
const debug = require('debug')('WebsocketServer')
const debugProtocol = require('debug')('WebsocketServer:protocol')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const Stream = require('./Stream')
const Connection = require('./Connection')
const HttpError = require('./errors/HttpError')
const VolumeLogger = require('./utils/VolumeLogger')

function getStreamLookupKey(streamId, streamPartition) {
    return `${streamId}-${streamPartition}`
}

module.exports = class WebsocketServer extends events.EventEmitter {
    constructor(wss, realtimeAdapter, storage, streamFetcher, publisher, volumeLogger = new VolumeLogger(0)) {
        super()
        this.wss = wss
        this.realtimeAdapter = realtimeAdapter
        this.storage = storage
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.volumeLogger = volumeLogger

        // This handler is for realtime messages, not resends
        this.realtimeAdapter.on('message', (streamMessage) => this.broadcastMessage(streamMessage))

        const subscribeRequestType = ControlLayer.SubscribeRequest.TYPE
        const unsubscribeRequestType = ControlLayer.UnsubscribeRequest.TYPE
        const resendRequestV0Type = ControlLayer.ResendRequestV0.TYPE
        const resendLastRequestType = ControlLayer.ResendLastRequestV1.TYPE
        const resendFromRequestType = ControlLayer.ResendFromRequestV1.TYPE
        const resendRangeRequestType = ControlLayer.ResendRangeRequestV1.TYPE
        const publishRequestType = ControlLayer.PublishRequest.TYPE
        const requestHandlersByMessageType = {}
        requestHandlersByMessageType[subscribeRequestType] = this.handleSubscribeRequest
        requestHandlersByMessageType[unsubscribeRequestType] = this.handleUnsubscribeRequest
        requestHandlersByMessageType[resendRequestV0Type] = this.handleResendRequestV0
        requestHandlersByMessageType[resendLastRequestType] = this.handleResendLastRequest
        requestHandlersByMessageType[resendFromRequestType] = this.handleResendFromRequest
        requestHandlersByMessageType[resendRangeRequestType] = this.handleResendRangeRequest
        requestHandlersByMessageType[publishRequestType] = this.handlePublishRequest

        this.wss.on('connection', (socket) => {
            debug('connection established: %o', socket)
            this.volumeLogger.connectionCount += 1

            const connection = new Connection(socket)

            socket.on('message', (data) => {
                try {
                    const request = ControlLayer.ControlMessage.deserialize(data)
                    const handler = requestHandlersByMessageType[request.type]
                    if (!handler) {
                        connection.sendError(`Unknown request type: ${request.type}`)
                    } else {
                        debugProtocol('%s: %s: %o', request.type, connection.id, request)
                        handler.call(this, connection, request)
                    }
                } catch (err) {
                    connection.sendError(err.message || err)
                }
            })

            socket.on('close', () => {
                this.volumeLogger.connectionCount -= 1
                this.handleDisconnect(connection)
            })
        })

        this.streams = {}
    }

    handlePublishRequest(connection, request) {
        let streamId
        if (request.version === 0) {
            /* eslint-disable prefer-destructuring */
            streamId = request.streamId
            /* eslint-enable prefer-destructuring */
        } else if (request.version === 1) {
            streamId = request.streamMessage.getStreamId()
        } else {
            throw new Error(`Unrecognized version: ${request.version}`)
        }
        this.streamFetcher.authenticate(streamId, request.apiKey, request.sessionToken, 'write')
            .then((stream) => {
                let streamMessage
                if (request.version === 0) {
                    const streamPartition = this.publisher.getStreamPartition(stream, request.partitionKey)
                    streamMessage = new MessageLayer.StreamMessageV30(
                        [stream.id, streamPartition, request.timestamp || Date.now(), 0, request.publisherAddress],
                        [null, 0],
                        MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                        request.content,
                        request.signatureType,
                        request.signature,
                    )
                } else if (request.version === 1) {
                    /* eslint-disable prefer-destructuring */
                    streamMessage = request.streamMessage
                    /* eslint-enable prefer-destructuring */
                } else {
                    throw new Error(`Unrecognized version: ${request.version}`)
                }
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
        // TODO: once new Cassandra schema set, rename getFromTimestamp --> getFromMsgRef
        // + use request.fromMsgRef.sequenceNumber and request.publisherId in the query
        this.handleResendRequest(connection, request, () => this.storage.fetchFromTimestamp(
            request.streamId,
            request.streamPartition,
            request.fromMsgRef.timestamp,
        ))
    }

    handleResendRangeRequest(connection, request) {
        // TODO: once new Cassandra schema set, rename getTimestampRange --> getMsgRefRange
        // + use request.fromMsgRef.sequenceNumber, request.toMsgRef.sequenceNumber and request.publisherId in the query
        this.handleResendRequest(connection, request, () => this.storage.fetchBetweenTimestamps(
            request.streamId,
            request.streamPartition,
            request.fromMsgRef.timestamp,
            request.toMsgRef.timestamp,
        ))
    }

    /* eslint-disable class-methods-use-this */
    handleResendRequestV0(connection) {
        connection.sendError('ResendRequestV0 is not supported anymore. Please update your Streamr client.')
        return null
    }
    /* eslint-enable class-methods-use-this */

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
                this.deleteStreamObject(streamId, streamPartition)
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

    broadcastMessage(streamMessage) {
        const stream = this.getStreamObject(streamMessage.getStreamId(), streamMessage.getStreamPartition())
        if (stream) {
            const connections = stream.getConnections()

            connections.forEach((connection) => {
                connection.send(ControlLayer.BroadcastMessage.create(streamMessage))
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * connections.length)
        }
    }

    handleSubscribeRequest(connection, request) {
        this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken)
            .then((/* streamJson */) => {
                let stream = this.getStreamObject(request.streamId, request.streamPartition)

                // Create Stream if it does not exist
                if (!stream) {
                    stream = this.createStreamObject(request.streamId, request.streamPartition)
                }

                // Subscribe now if the stream is not already subscribed or subscribing
                if (!(stream.state === 'subscribed' || stream.state === 'subscribing')) {
                    stream.state = 'subscribing'
                    this.realtimeAdapter.subscribe(request.streamId, request.streamPartition, (err) => {
                        if (err) {
                            stream.emit('subscribed', err)

                            // Delete the stream ref on subscribe error
                            this.deleteStreamObject(stream.id, request.streamPartition)

                            console.log(`Error subscribing to ${stream.id}: ${err}`)
                        } else {
                            stream.state = 'subscribed'
                            stream.emit('subscribed')
                        }
                    })
                }

                const onSubscribe = () => {
                    stream.addConnection(connection)
                    connection.addStream(stream)

                    debug('Socket %s is now subscribed to streams: %o', connection.id, connection.getStreams())
                    connection.send(ControlLayer.SubscribeResponse.create(request.streamId, request.streamPartition))
                }

                // If the Stream is subscribed, we're good to go
                if (stream.state === 'subscribed') {
                    onSubscribe()
                }
                // If the Stream is not yet subscribed, wait for the event
                if (stream.state !== 'subscribed') {
                    stream.once('subscribed', (err) => {
                        if (err) {
                            connection.sendError(err)
                        } else {
                            onSubscribe()
                        }
                    })
                }
            })
            .catch(() => {
                connection.sendError(`Not authorized to subscribe to stream ${
                    request.streamId
                } and partition ${
                    request.streamPartition
                }`)
            })
    }

    handleUnsubscribeRequest(connection, request, ack = true) {
        const stream = this.getStreamObject(request.streamId, request.streamPartition)

        if (stream) {
            debug(
                'handleUnsubscribeRequest: socket %s unsubscribed from stream %s partition %d',
                connection.id, request.streamId, request.streamPartition,
            )

            stream.removeConnection(connection)
            connection.removeStream(request.streamId, request.streamPartition)

            debug('handleUnsubscribeRequest: Socket %s is now subscribed to streams: %o', connection.id, connection.getStreams())

            /**
             * Check whether anyone is subscribed to the stream anymore
             */
            if (stream.getConnections().length) {
                debug(
                    'checkRoomEmpty: Clients remaining on %s partition %d: %d',
                    request.streamId, request.streamPartition, stream.getConnections().length,
                )
            } else {
                debug(
                    'checkRoomEmpty: stream %s partition %d has no clients remaining, unsubscribing realtimeAdapter...',
                    request.streamId, request.streamPartition,
                )
                this.realtimeAdapter.unsubscribe(request.streamId, request.streamPartition)
                this.deleteStreamObject(request.streamId, request.streamPartition)
            }

            if (ack) {
                connection.send(ControlLayer.UnsubscribeResponse.create(request.streamId, request.streamPartition))
            }
        } else {
            connection.sendError(`Not subscribed to stream ${request.streamId} partition ${request.streamPartition}!`)
        }
    }

    handleDisconnect(connection) {
        debug('handleDisconnect: socket %s was on streams: %o', connection.id, connection.getStreams())

        const unsub = connection.getStreams()

        // Unsubscribe from all streams
        unsub.forEach((stream) => {
            this.handleUnsubscribeRequest(connection, ControlLayer.UnsubscribeRequest.create(stream.id, stream.partition), false)
        })
    }
}
