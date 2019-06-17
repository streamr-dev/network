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

        this.streams = new StreamStateManager()

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))
        this.mqttServer.on('connection', this.onNewClientConnection.bind(this))
    }

    close() {
        this.streams.close()
        this.mqttServer.close(() => {
        })
    }

    onNewClientConnection(mqttStream) {
        const client = mqttCon(mqttStream)
        let connection

        client.on('connect', (packet) => {
            debug('connect request %o', packet)

            const { username, password } = packet
            const apiKey = password.toString()

            this.streamFetcher.getToken(apiKey)
                .then((res) => {
                    // got some error
                    if (res.code) {
                        // Connection refused, bad user name or password
                        client.connack({
                            returnCode: 4
                        })
                        return
                    }

                    // got token
                    if (res.token) {
                        // Connection accepted
                        client.connack({
                            returnCode: 0
                        })

                        connection = new Connection(client, packet.clientId, res.token, apiKey)

                        connection.on('close', () => {
                            debug('closing client')
                            this._closeClient(connection)
                        })

                        connection.on('error', (err) => {
                            debug('error in client %s', err)
                            this._closeClient(connection)
                        })

                        connection.on('disconnect', () => {
                            debug('client disconnected')
                            this._closeClient(connection)
                        })

                        connection.on('publish', (publishPacket) => {
                            this.handlePublishRequest(connection, publishPacket)
                        })

                        connection.on('subscribe', (subscribePacket) => {
                            this.handleSubscribeRequest(connection, subscribePacket)
                        })

                        // timeout idle streams after X minutes
                        mqttStream.setTimeout(this.streamsTimeout)

                        // stream timeout
                        mqttStream.on('timeout', () => {
                            debug('client timeout')
                            this._closeClient(connection)
                        })

                        this.volumeLogger.connectionCount += 1
                        debug('onNewClientConnection: mqtt "%s" connected', connection.id)
                    }
                })
        })
    }

    handlePublishRequest(connection, packet) {
        debug('publish request %o', packet)

        const { topic, payload } = packet

        this.streamFetcher.getStream(topic, connection.token)
            .then((streamObj) => {
                if (streamObj === undefined) {
                    connection.client.connack({
                        returnCode: 5
                    })
                    return
                }
                this.streamFetcher.authenticate(streamObj.id, connection.apiKey, connection.token, 'write')
                    .then((/* streamJson */) => {
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
                            [null, null],
                            MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                            mqttPayloadToJson(textPayload),
                            MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE, null
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

    handleSubscribeRequest(connection, packet) {
        debug('subscribe request %o', packet)

        const { topic } = packet.subscriptions[0]

        this.streamFetcher.getStream(topic, connection.token)
            .then((streamObj) => {
                this.streamFetcher.authenticate(streamObj.id, connection.apiKey, connection.token)
                    .then((/* streamJson */) => {
                        const newOrExistingStream = this.streams.getOrCreate(streamObj.id, 0, streamObj.name)

                        // Subscribe now if the stream is not already subscribed or subscribing
                        if (!newOrExistingStream.isSubscribed() && !newOrExistingStream.isSubscribing()) {
                            newOrExistingStream.setSubscribing()
                            this.networkNode.subscribe(streamObj.id, 0)
                            newOrExistingStream.setSubscribed()

                            newOrExistingStream.addConnection(connection)
                            connection.addStream(newOrExistingStream)
                            debug(
                                'handleSubscribeRequest: client "%s" is now subscribed to streams "%o"',
                                connection.id, connection.streamsAsString()
                            )

                            connection.client.suback({
                                granted: [packet.qos], messageId: packet.messageId
                            })
                        } else {
                            console.error('error')
                        }
                    })
                    .catch((response) => {
                        console.log(response)
                    })
            })
    }

    _closeClient(connection) {
        this.volumeLogger.connectionCount -= 1
        debug('closing client "%s" on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            const object = {
                messageId: 0,
                unsubscriptions: [stream.getName()]
            }
            connection.client.unsubscribe(object)
        })

        connection.client.destroy()
    }

    broadcastMessage({
        streamId,
        streamPartition,
        timestamp,
        sequenceNo,
        publisherId,
        msgChainId,
        previousTimestamp,
        previousSequenceNo,
        data,
        signatureType,
        signature,
    }) {
        const stream = this.streams.get(streamId, streamPartition)

        if (stream) {
            const object = {
                cmd: 'publish',
                topic: stream.name,
                payload: JSON.stringify(data)
            }

            stream.forEachConnection((connection) => {
                connection.client.publish(object, () => {
                })
            })

            this.volumeLogger.logOutput(data.length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s::%d" not found', streamId, streamPartition)
        }
    }
}
