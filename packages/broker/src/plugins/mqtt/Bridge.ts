import _ from 'lodash'
import { StreamrClient, Subscription } from 'streamr-client'
import { StreamPartIDUtils } from 'streamr-client-protocol'
import { Logger, Protocol } from 'streamr-network'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { MqttServer, MqttServerListener } from './MqttServer'

const logger = new Logger(module)

interface StreamSubscription {
    streamrClientSubscription: Subscription,
    clientIds: string[]
}

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
    private subscriptions: StreamSubscription[] = []
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
        } catch (err: any) {
            logger.warn(`Unable to publish message: ${err.message}`)
            return
        }
        const { content, metadata } = message
        const publishedMessage = await this.streamrClient.publish(this.getStreamId(topic), content, metadata.timestamp)
        this.publishMessageChains.add(createMessageChainKey(publishedMessage))
    }

    async onSubscribed(topic: string, clientId: string): Promise<void> {
        logger.info('Client subscribed: ' + topic)
        const streamId = this.getStreamId(topic)
        const existingSubscription = this.getSubscription(streamId) 
        if (existingSubscription === undefined) {
            const streamrClientSubscription = await this.streamrClient.subscribe(streamId, (content: any, metadata: Protocol.StreamMessage) => {
                if (!this.isSelfPublishedMessage(metadata)) {
                    const payload = this.payloadFormat.createPayload(content, metadata.messageId)
                    this.mqttServer.publish(topic, payload)    
                }
            })
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
    private isSelfPublishedMessage(message: Protocol.StreamMessage<any>): boolean {
        const messageChainKey = createMessageChainKey(message)
        return this.publishMessageChains.has(messageChainKey)
    }

    onUnsubscribed(topic: string, clientId: string): void {
        logger.info('Client unsubscribed: ' + topic)
        const streamId = this.getStreamId(topic)
        const existingSubscription = this.getSubscription(streamId)
        if (existingSubscription !== undefined) {
            existingSubscription.clientIds = _.without(existingSubscription.clientIds, clientId)
            if (existingSubscription.clientIds.length === 0) {
                existingSubscription.streamrClientSubscription.unsubscribe()
                this.subscriptions = _.without(this.subscriptions, existingSubscription)
            }
        }
    }

    private getStreamId(topic: string): string {
        if (this.streamIdDomain !== undefined) {
            return this.streamIdDomain + '/' + topic
        } else {
            return topic
        }
    }

    private getSubscription(streamId: string): StreamSubscription|undefined {
        return this.subscriptions.find((s: StreamSubscription) => {
            // TODO take partition into consideration?
            return StreamPartIDUtils.getStreamID(s.streamrClientSubscription.streamPartId) === streamId
        })
    }
}
