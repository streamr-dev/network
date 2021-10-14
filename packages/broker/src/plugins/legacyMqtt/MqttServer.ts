import { Server, Socket } from 'net'
import { EventEmitter } from 'events'
import mqttCon from 'mqtt-connection'
import { Metrics, MetricsContext, NetworkNode } from 'streamr-network'
import { StreamMessage, MessageID } from 'streamr-network/dist/streamr-protocol'
import { Logger } from 'streamr-network'
import { partition } from '../../helpers/partition'
import { Publisher } from '../../Publisher'
import { StreamFetcher } from '../../StreamFetcher'
import { StreamStateManager } from '../../StreamStateManager'
import { SubscriptionManager } from '../../SubscriptionManager'
import { Connection } from './Connection'
import * as mqtt from "mqtt-packet"
import { IPubackPacket } from "async-mqtt"

const logger = new Logger(module)

let sequenceNumber = 0

function mqttPayloadToObject(payload: string): string | { mqttPayload: string } {
    try {
        JSON.parse(payload)
    } catch (e) {
        return {
            mqttPayload: payload
        }
    }
    return payload
}

export class MqttServer extends EventEmitter {
    mqttServer: Server
    streamsTimeout: number | null
    networkNode: NetworkNode
    streamFetcher: StreamFetcher
    publisher: Publisher
    partitionFn
    subscriptionManager: SubscriptionManager
    connections = new Set<Connection>()
    streams: StreamStateManager<Connection>
    metrics: Metrics

    constructor(
        mqttServer: Server,
        streamsTimeout: number | null,
        networkNode: NetworkNode,
        streamFetcher: StreamFetcher,
        publisher: Publisher,
        metricsContext: MetricsContext,
        subscriptionManager: SubscriptionManager,
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

        this.streams = new StreamStateManager()
        this.broadcastMessage = this.broadcastMessage.bind(this)
        this.onNewClientConnection = this.onNewClientConnection.bind(this)
        this.networkNode.addMessageListener(this.broadcastMessage)
        this.mqttServer.on('connection', this.onNewClientConnection)

        this.metrics = metricsContext.create('broker/mqtt')
            .addRecordedMetric('outBytes')
            .addRecordedMetric('outMessages')
            .addQueriedMetric('connections', () => this.connections.size)
    }

    close(): Promise<void> {
        this.networkNode.removeMessageListener(this.broadcastMessage)
        this.mqttServer.off('connection', this.onNewClientConnection)
        this.streams.close()
        this.connections.forEach((connection) => this.closeConnection(connection))

        return new Promise((resolve, reject) => {
            this.mqttServer.close((err?: Error) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(undefined)
                }
            })
        })
    }

    private createNewConnection(client: mqttCon.Connection) {
        const connection = new Connection(client)

        connection.on('close', () => {
            logger.debug('closing client')
            connection.markAsDead()
            this.closeConnection(connection)
        })

        connection.on('error', (err) => {
            logger.warn(`dropping client because: ${err.message}`)
            logger.debug('error in client %s', err)
            connection.markAsDead()
            this.closeConnection(connection)
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

    private onNewClientConnection(mqttStream: Socket) {
        const connection = this.createNewConnection(mqttCon(mqttStream))
        this.connections.add(connection)

        if (this.streamsTimeout != null) {
            mqttStream.setTimeout(this.streamsTimeout)
        }
        mqttStream.once('timeout', () => {
            logger.debug('mqttStream timeout')
            this.closeConnection(connection)
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
                }, (err) => {
                    logger.warn('onNewClientConnection: error fetching token %s', err.stack)
                    if (err.code === 'INVALID_ARGUMENT') {
                        connection.sendConnectionRefused()
                    } else {
                        connection.sendConnectionRefusedServerUnavailable()
                    }
                })
        })
    }

    async handlePublishRequest(connection: Connection, packet: mqtt.IPublishPacket): Promise<void> {
        logger.debug('publish request %o', packet)

        const { topic, payload, qos } = packet

        try {
            const streamObj = await this.streamFetcher.authenticate(topic, connection.token, 'stream_publish') as {
                id: string,
                partitions: number
            }

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

    handleUnsubscribeRequest(connection: Connection, packet: mqtt.IUnsubscribePacket): void {
        logger.debug('unsubscribe request %o', packet)

        const topic = packet.unsubscriptions[0]
        const stream = this.streams.get(topic, 0)

        if (stream) {
            this.subscriptionManager.unsubscribe(stream.getId(), stream.getPartition())
            connection.removeStream(stream.getId(), stream.getPartition())

            connection.client.unsuback(packet as any)
        }
    }

    async handleSubscribeRequest(connection: Connection, packet: mqtt.ISubscribePacket & mqtt.ISubscription): Promise<void> {
        logger.debug('subscribe request %o', packet)

        const { topic } = packet.subscriptions[0]

        try {
            const streamObj = await this.streamFetcher.authenticate(topic, connection.token, 'stream_subscribe') as {
                id: string,
                partitions: number,
                name: string
            }
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

    closeConnection(connection: Connection): void {
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

    broadcastMessage(streamMessage: StreamMessage): void {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = this.streams.get(streamId, 0)

        if (stream) {
            const object = {
                cmd: 'publish',
                topic: stream.name,
                payload: JSON.stringify(streamMessage.getParsedContent())
            }

            stream.forEachConnection((connection: Connection) => {
                connection.client.publish(object as Partial<IPubackPacket>, () => {})
            })

            this.metrics.record('outBytes', streamMessage.getSerializedContent().length * stream.getConnections().length)
            this.metrics.record('outMessages', stream.getConnections().length)
        } else {
            logger.debug('broadcastMessage: stream "%s::%d" not found', streamId, streamPartition)
        }
    }
}
