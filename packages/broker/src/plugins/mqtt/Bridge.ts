import { StreamrClient, Subscription } from 'streamr-client'
import { Logger, Protocol } from 'streamr-network'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { MqttServer, MqttServerListener } from './MqttServer'

const logger = new Logger(module)

type MessageChainKey = string

const createMessageChainKey = (message: Protocol.StreamMessage<any>) => {
    const DELIMITER = '-'
    const { messageId } = message
    return [messageId.streamId, messageId.streamPartition, messageId.publisherId, messageId.msgChainId].join(DELIMITER)
}

export class Bridge implements MqttServerListener {

    private readonly streamrClient: StreamrClient
    private readonly mqttServer: MqttServer
    private readonly payloadFormat: PayloadFormat
    private readonly streamIdDomain?: string
    private publishMessageChains = new Set<MessageChainKey>()

    constructor(streamrClient: StreamrClient, mqttServer: MqttServer, payloadFormat: PayloadFormat, streamIdDomain?: string) {
        this.streamrClient = streamrClient
        this.mqttServer = mqttServer
        this.payloadFormat = payloadFormat
        this.streamIdDomain = streamIdDomain
    }

    async onMessageReceived(topic: string, payload: string): Promise<void> {
        let message
        try {
            message = this.payloadFormat.createMessage(payload)
        } catch (err) {
            logger.warn(`Unable to publish message: ${err.message}`)
            return
        }
        const { content, metadata } = message
        const publishedMessage = await this.streamrClient.publish(this.getStreamId(topic), content, metadata.timestamp)
        this.publishMessageChains.add(createMessageChainKey(publishedMessage))
    }

    onSubscribed(topic: string): void {
        logger.info('Client subscribed: ' + topic)
        this.streamrClient.subscribe(this.getStreamId(topic), (content: any, metadata: Protocol.StreamMessage) => {
            if (!this.isSelfPublishedMessage(metadata)) {
                const payload = this.payloadFormat.createPayload(content, metadata.messageId)
                this.mqttServer.publish(topic, payload)    
            }
        })
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
    private isSelfPublishedMessage(message: Protocol.StreamMessage<any>): boolean {
        const messageChainKey = createMessageChainKey(message)
        return this.publishMessageChains.has(messageChainKey)
    }

    onUnsubscribed(topic: string): void {
        logger.info('Client unsubscribed: ' + topic)
        const streamId = this.getStreamId(topic)
        this.streamrClient!.getSubscriptions()
            .filter((subscription: Subscription) => (subscription.streamId === streamId))
            .forEach((subscription: Subscription) => this.streamrClient!.unsubscribe(subscription))
    }

    private getStreamId(topic: string): string {
        if (this.streamIdDomain !== undefined) {
            return this.streamIdDomain + '/' + topic
        } else {
            return topic
        }
    }
}
