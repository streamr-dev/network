const events = require('events')

const mqttCon = require('mqtt-connection')
const { MessageLayer } = require('streamr-network').Protocol

const logger = require('../helpers/logger')('streamr:MqttServer')
const partition = require('../helpers/partition')
const StreamStateManager = require('../StreamStateManager')

const Connection = require('./Connection')

const { StreamMessage, MessageID } = MessageLayer

let sequenceNumber = 0

function mqttPayloadToObject(payload) {
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
        metricsContext,
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
        this.subscriptionManager = subscriptionManager
        this.connections = new Set()

        this.streams = new StreamStateManager()

        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))
        this.mqttServer.on('connection', this.onNewClientConnection.bind(this))

        this.metrics = metricsContext.create('broker/mqtt')
            .addRecordedMetric('outBytes')
            .addRecordedMetric('outMessages')
            .addQueriedMetric('connections', () => this.connections.size)
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
            logger.debug('closing client')
            connection.markAsDead()
            this._closeConnection(connection)
        })

        connection.on('error', (err) => {
            logger.warn(`dropping client because: ${err.message}`)
            logger.debug('error in client %s', err)
            connection.markAsDead()
            this._closeConnection(connection)
        })

        connection.on('disconnect', () => {
            logger.debug('client disconnected')
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
            logger.debug('mqttStream timeout')
            this._closeConnection(connection)
        })

        connection.on('connect', (packet) => {
            logger.debug('connect request %o', packet)

            if (packet.password == null) {
                connection.sendConnectionRefused()
                return
            }

            const privateKey = packet.password.toString()

            this.streamFetcher.getToken(privateKey)
                .then((sessionToken) => {
                    connection.sendConnectionAccepted()
                    connection.setClientId(packet.clientId).setToken(sessionToken)
                    logger.debug('onNewClientConnection: mqtt "%s" connected', connection.id)
                })
                .catch((err) => {
                    logger.warn('onNewClientConnection: error fetching token %o', err)
                    if (err.code === 'INVALID_ARGUMENT') {
                        connection.sendConnectionRefused()
                    } else {
                        connection.sendConnectionRefusedServerUnavailable()
                    }
                })
        })
    }

    async handlePublishRequest(connection, packet) {
        logger.debug('publish request %o', packet)

        const { topic, payload, qos } = packet

        try {
            const streamObj = await this.streamFetcher.authenticate(topic, connection.token, 'stream_publish')

            // No way to define partition over MQTT, so choose a random partition
            const streamPartition = this.partitionFn(streamObj.partitions)

            const textPayload = payload.toString()
            sequenceNumber += 1
            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamObj.id, streamPartition, Date.now(), sequenceNumber, connection.id, connection.id),
                content: mqttPayloadToObject(textPayload),
            })

            await this.publisher.validateAndPublish(streamMessage)

            if (qos) {
                connection.client.puback({
                    messageId: packet.messageId
                })
            }
        } catch (err) {
            logger.debug(
                'handlePublishRequest: socket "%s" failed to publish to stream "%s:%d" because of "%o"',
                connection.id, topic, 0, err
            )
            connection.sendConnectionNotAuthorized()
        }
    }

    handleUnsubscribeRequest(connection, packet) {
        logger.debug('unsubscribe request %o', packet)

        const topic = packet.unsubscriptions[0]
        const stream = this.streams.get(topic, 0)

        if (stream) {
            this.subscriptionManager.unsubscribe(stream.getId(), stream.getPartition())
            connection.removeStream(stream.getId(), stream.getPartition())

            connection.client.unsuback(packet)
        }
    }

    async handleSubscribeRequest(connection, packet) {
        logger.debug('subscribe request %o', packet)

        const { topic } = packet.subscriptions[0]

        try {
            const streamObj = await this.streamFetcher.authenticate(topic, connection.token, 'stream_subscribe')
            const newOrExistingStream = this.streams.getOrCreate(streamObj.id, 0, streamObj.name)

            // Subscribe now if the stream is not already subscribed or subscribing
            if (!newOrExistingStream.isSubscribed() && !newOrExistingStream.isSubscribing()) {
                newOrExistingStream.setSubscribing()
                this.subscriptionManager.subscribe(streamObj.id, 0)
                newOrExistingStream.setSubscribed()
            }

            newOrExistingStream.addConnection(connection)
            connection.addStream(newOrExistingStream)
            logger.debug(
                'handleSubscribeRequest: client "%s" is now subscribed to streams "%o"',
                connection.id, connection.streamsAsString()
            )

            connection.client.suback({
                granted: [packet.qos], messageId: packet.messageId
            })
        } catch (err) {
            logger.debug(
                'handleSubscribeRequest: socket "%s" failed to subscribe to stream "%s:%d" because of "%o"',
                connection.id, topic, 0, err
            )
            connection.sendConnectionNotAuthorized()
        }
    }

    _closeConnection(connection) {
        this.connections.delete(connection)
        logger.debug('closing client "%s" on streams "%o"', connection.id, connection.streamsAsString())

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
                    logger.debug(
                        'checkRoomEmpty: stream "%s:%d" is empty. Unsubscribing from NetworkNode.',
                        stream.getId(), stream.getPartition()
                    )

                    this.subscriptionManager.unsubscribe(stream.getId(), stream.getPartition())
                    this.streams.delete(stream.getId(), stream.getPartition())
                }
            }
        })

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
                connection.client.publish(object, () => {})
            })

            this.metrics.record('outBytes', streamMessage.getSerializedContent().length * stream.getConnections().length)
            this.metrics.record('outMessages', stream.getConnections().length)
        } else {
            logger.debug('broadcastMessage: stream "%s::%d" not found', streamId, streamPartition)
        }
    }
}
