import { MessageMetadata, StreamrClient, Subscription } from '@streamr/sdk'
import { Logger, StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/utils'
import without from 'lodash/without'
import { Message, PayloadFormat } from '../../helpers/PayloadFormat'
import { parsePositiveInteger, parseQueryAndBase, parseQueryParameter } from '../../helpers/parser'
import { PublishPartitionDefinition, getPartitionKey, parsePublishPartitionDefinition } from '../../helpers/partitions'
import { MqttServer, MqttServerListener } from './MqttServer'

const DEFAULT_PARTITION = 0

const logger = new Logger(module)

interface StreamSubscription {
    streamrClientSubscription: Subscription
    clientIds: string[]
}

type MessageChainKey = string

const createMessageChainKey = (message: MessageMetadata) => {
    const DELIMITER = '-'
    return [message.streamId, message.streamPartition, message.publisherId, message.msgChainId].join(DELIMITER)
}

export class Bridge implements MqttServerListener {
    private readonly streamrClient: StreamrClient
    private readonly mqttServer: MqttServer
    private readonly payloadFormat: PayloadFormat
    private readonly streamIdDomain?: string
    private subscriptions: StreamSubscription[] = []
    private publishMessageChains = new Set<MessageChainKey>()

    constructor(
        streamrClient: StreamrClient,
        mqttServer: MqttServer,
        payloadFormat: PayloadFormat,
        streamIdDomain?: string
    ) {
        this.streamrClient = streamrClient
        this.mqttServer = mqttServer
        this.payloadFormat = payloadFormat
        this.streamIdDomain = streamIdDomain
    }

    async onMessageReceived(topic: string, payload: string, clientId: string): Promise<void> {
        let message: Message
        let streamPart: { streamId: StreamID } & PublishPartitionDefinition
        try {
            message = this.payloadFormat.createMessage(payload)
            streamPart = this.getPublishStreamPart(topic)
        } catch (err) {
            logger.warn('Unable to form message', { err, topic, clientId })
            return
        }
        const { content, metadata } = message
        try {
            const publishedMessage = await this.streamrClient.publish(
                {
                    id: streamPart.streamId,
                    partition: streamPart.partition
                },
                content,
                {
                    timestamp: metadata.timestamp,
                    partitionKey: getPartitionKey(content, streamPart),
                    msgChainId: clientId
                }
            )
            this.publishMessageChains.add(createMessageChainKey(publishedMessage))
        } catch (err: any) {
            logger.warn('Unable to publish message', { err, topic, clientId })
        }
    }

    async onSubscribed(topic: string, clientId: string): Promise<void> {
        logger.info('Handle client subscribe', { clientId, topic })
        const streamPart = this.getSubscribeStreamPart(topic)
        const existingSubscription = this.getSubscription(streamPart)
        if (existingSubscription === undefined) {
            const streamrClientSubscription = await this.streamrClient.subscribe(
                streamPart,
                (content: any, metadata: MessageMetadata) => {
                    if (!this.isSelfPublishedMessage(metadata)) {
                        const payload = this.payloadFormat.createPayload(content, metadata)
                        this.mqttServer.publish(topic, payload)
                    }
                }
            )
            this.subscriptions.push({
                streamrClientSubscription,
                clientIds: [clientId]
            })
        } else {
            existingSubscription.clientIds.push(clientId)
        }
    }

    /**
     *
     * If a stream is subscribed with a MQTT client and also published with same or another
     * MQTT client, the message could be delivered to the subscribed client two
     * ways:
     *
     * 1) automatic mirroring by Aedes (delivers all published messages to all subscribers)
     * 2) via network node: the subscribing MQTT client receives the published message from the
     *    network node as it subscribes to the stream (by calling streamrClient.subscribe)
     *
     * The message should be delivered to the subscribed client only once. Theferore we filter
     * out the "via network node" case by checking whether the message is one of the messages
     * which the Bridge published to the network node.
     *
     * Each publishing session of a stream yields to a unique MessageChainKey value. We store that
     * key value when we call streamrClient.publish().
     *
     * Here we simply check if the incoming message belongs to one of the publish chains. If it
     * does, it must have been published by this Bridge.
     */
    private isSelfPublishedMessage(message: MessageMetadata): boolean {
        const messageChainKey = createMessageChainKey(message)
        return this.publishMessageChains.has(messageChainKey)
    }

    onUnsubscribed(topic: string, clientId: string): void {
        logger.info('Handle client unsubscribe', { clientId, topic })
        const streamPart = this.getSubscribeStreamPart(topic)
        const existingSubscription = this.getSubscription(streamPart)
        if (existingSubscription !== undefined) {
            existingSubscription.clientIds = without(existingSubscription.clientIds, clientId)
            if (existingSubscription.clientIds.length === 0) {
                existingSubscription.streamrClientSubscription.unsubscribe()
                this.subscriptions = without(this.subscriptions, existingSubscription)
            }
        }
    }

    private getSubscribeStreamPart(topic: string): StreamPartID {
        const { base, query } = parseQueryAndBase(topic)
        const partition = parseQueryParameter('partition', query, parsePositiveInteger)
        return toStreamPartID(this.getStreamId(base), partition ?? DEFAULT_PARTITION)
    }

    private getPublishStreamPart(topic: string): { streamId: StreamID } & PublishPartitionDefinition {
        const { base, query } = parseQueryAndBase(topic)
        return {
            streamId: this.getStreamId(base),
            ...parsePublishPartitionDefinition(query)
        }
    }

    private getStreamId(topicBase: string): StreamID {
        return toStreamID(this.streamIdDomain !== undefined ? `${this.streamIdDomain}/${topicBase}` : topicBase)
    }

    private getSubscription(streamPartId: StreamPartID): StreamSubscription | undefined {
        return this.subscriptions.find((s: StreamSubscription) => {
            return s.streamrClientSubscription.streamPartId === streamPartId
        })
    }
}
