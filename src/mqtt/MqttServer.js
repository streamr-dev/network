const events = require('events')

const debug = require('debug')('streamr:MqttServer')
const mqttCon = require('mqtt-connection')
const { MessageLayer } = require('streamr-client-protocol')

const VolumeLogger = require('../VolumeLogger')
const partition = require('../partition')
const StreamStateManager = require('../StreamStateManager')

const Connection = require('./Connection')

let sequenceNumber = 0

function mqttPayloadToJson(payload) {
    try {
        JSON.parse(payload)
    } catch (e) {
        return {
            mqttPayload: payload
        }
    }
    return payload
}

module.exports = class MqttServer extends events.EventEmitter {
    constructor(
        mqttServer,
        streamsTimeout,
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger = new VolumeLogger(0),
        subscriptionManager,
        partitionFn = partition,
    ) {
        super()

        this.mqttServer = mqttServer
        this.streamsTimeout = streamsTimeout
        this.networkNode = networkNode
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.partitionFn = partitionFn
        this.volumeLogger = volumeLogger
        this.subscriptionManager = subscriptionManager
        this.connections = new Set()

        this.streams = new StreamStateManager()

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))
        this.mqttServer.on('connection', this.onNewClientConnection.bind(this))
    }

    close() {
        this.streams.close()
        this.connections.forEach((connection) => this._closeConnection(connection))

        return new Promise((resolve, reject) => {
            this.mqttServer.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    _createNewConnection(client) {
        const connection = new Connection(client)

        connection.on('close', () => {
            debug('closing client')
            this._closeConnection(connection)
        })

        connection.on('error', (err) => {
            console.error(`dropping client because: ${err.message}`)
            debug('error in client %s', err)
        })

        connection.on('disconnect', () => {
            debug('client disconnected')
        })

        connection.on('publish', (publishPacket) => {
            this.handlePublishRequest(connection, publishPacket)
        })

        connection.on('subscribe', (subscribePacket) => {
            this.handleSubscribeRequest(connection, subscribePacket)
        })

        connection.on('unsubscribe', (unsubscribePacket) => {
            this.handleUnsubscribeRequest(connection, unsubscribePacket)
        })

        return connection
    }

    onNewClientConnection(mqttStream) {
        const connection = this._createNewConnection(mqttCon(mqttStream))
        this.connections.add(connection)

        mqttStream.setTimeout(this.streamsTimeout)
        mqttStream.on('timeout', () => {
            debug('mqttStream timeout')
            this._closeConnection(connection)
        })

        connection.on('connect', (packet) => {
            debug('connect request %o', packet)

            const { username, password } = packet
            const apiKey = password.toString()

            this.streamFetcher.getToken(apiKey)
                .then((res) => {
                    // got some error
                    if (res.code) {
                        connection.sendConnectionRefused()
                        return
                    }

                    // got token
                    if (res.token) {
                        connection.sendConnectionAccepted()
                        connection.setClientId(packet.clientId).setApiKey(apiKey).setToken(res.token)

                        debug('onNewClientConnection: mqtt "%s" connected', connection.id)
                    }
                })

            this.volumeLogger.connectionCount += 1
        })
    }

    handlePublishRequest(connection, packet) {
        debug('publish request %o', packet)

        const { topic, payload } = packet

        this.streamFetcher.getStream(topic, connection.token)
            .then((streamObj) => {
                if (streamObj === undefined) {
                    connection.sendConnectionNotAuthorized()
                    return
                }
                this.streamFetcher.authenticate(streamObj.id, connection.apiKey, connection.token, 'write')
                    .then((streamJson) => {
                        const streamPartition = this.partitionFn(streamObj.partitions, 0)

                        const textPayload = payload.toString()
                        const streamMessage = MessageLayer.StreamMessage.create(
                            [
                                streamObj.id,
                                streamPartition,
                                Date.now(),
                                sequenceNumber,
                                connection.id,
                                '',
                            ],
                            null,
                            MessageLayer.StreamMessage.CONTENT_TYPES.MESSAGE,
                            MessageLayer.StreamMessage.ENCRYPTION_TYPES.NONE,
                            mqttPayloadToJson(textPayload),
                            MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )

                        this.publisher.publish(streamObj, streamMessage)

                        sequenceNumber += 1

                        connection.client.puback({
                            messageId: packet.messageId
                        })
                    })
                    .catch((err) => {
                        console.log(err)
                    })
            })
    }

    handleUnsubscribeRequest(connection, packet) {
        debug('unsubscribe request %o', packet)

        const topic = packet.unsubscriptions[0]
        const stream = this.streams.getByName(topic)

        if (stream) {
            this.subscriptionManager.unsubscribe(stream.getId(), stream.getPartition())
            connection.removeStream(stream.getId(), stream.getPartition())

            connection.client.unsuback(packet)
        }
    }

    handleSubscribeRequest(connection, packet) {
        debug('subscribe request %o', packet)

        const { topic } = packet.subscriptions[0]

        this.streamFetcher.getStream(topic, connection.token)
            .then((streamObj) => {
                this.streamFetcher.authenticate(streamObj.id, connection.apiKey, connection.token)
                    .then((streamJson) => {
                        const newOrExistingStream = this.streams.getOrCreate(streamObj.id, 0, streamObj.name)

                        // Subscribe now if the stream is not already subscribed or subscribing
                        if (!newOrExistingStream.isSubscribed() && !newOrExistingStream.isSubscribing()) {
                            newOrExistingStream.setSubscribing()
                            this.subscriptionManager.subscribe(streamObj.id, 0)
                            newOrExistingStream.setSubscribed()
                        }

                        newOrExistingStream.addConnection(connection)
                        connection.addStream(newOrExistingStream)
                        debug(
                            'handleSubscribeRequest: client "%s" is now subscribed to streams "%o"',
                            connection.id, connection.streamsAsString()
                        )

                        connection.client.suback({
                            granted: [packet.qos], messageId: packet.messageId
                        })
                    })
                    .catch((response) => {
                        console.log(response)
                    })
            }).catch((response) => {
                debug(
                    'handleSubscribeRequest: socket "%s" failed to subscribe to stream "%s:%d" because of "%o"',
                    connection.id, topic, 0, response
                )

                connection.sendConnectionNotAuthorized()
            })
    }

    _closeConnection(connection) {
        this.volumeLogger.connectionCount -= 1
        debug('closing client "%s" on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            const object = {
                messageId: 0,
                unsubscriptions: [stream.getName()]
            }

            connection.sendUnsubscribe(object)

            const streamObj = this.streams.get(stream.getId(), stream.getPartition())

            if (streamObj) {
                streamObj.removeConnection(connection)

                if (streamObj.getConnections().length === 0) {
                    debug(
                        'checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.',
                        stream.getId(), stream.getPartition()
                    )

                    this.subscriptionManager.unsubscribe(stream.getId(), stream.getPartition())
                    this.streams.delete(stream.getId(), stream.getPartition())
                }
            }
        })

        this.connections.delete(connection)
        connection.close()
    }

    broadcastMessage(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, 0)

        if (stream) {
            const object = {
                cmd: 'publish',
                topic: stream.name,
                payload: JSON.stringify(streamMessage.getParsedContent())
            }

            stream.forEachConnection((connection) => {
                connection.client.publish(object, () => {
                })
            })

            this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s::%d" not found', streamId, streamPartition)
        }
    }
}
