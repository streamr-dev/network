import { StreamrClient, Subscription } from 'streamr-client'
import { Logger } from 'streamr-network'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { MqttServer, MqttServerListener } from './MqttServer'

const logger = new Logger(module)

export class Bridge implements MqttServerListener {

    private readonly streamrClient: StreamrClient
    private readonly mqttServer: MqttServer
    private readonly payloadFormat: PayloadFormat
    private readonly streamIdDomain?: string

    constructor(streamrClient: StreamrClient, mqttServer: MqttServer, payloadFormat: PayloadFormat, streamIdDomain?: string) {
        this.streamrClient = streamrClient
        this.mqttServer = mqttServer
        this.payloadFormat = payloadFormat
        this.streamIdDomain = streamIdDomain
    }

    onMessageReceived(topic: string, payload: string): void {
        let message
        try {
            message = this.payloadFormat.createMessage(payload)
        } catch (err) {
            logger.warn(`Unable to publish message: ${err.message}`)
            return
        }
        const { content, metadata } = message
        this.streamrClient.publish(this.getStreamId(topic), content, metadata.timestamp)
    }
    
    onSubscribed(topic: string): void {
        logger.info('Client subscribed: ' + topic)
        this.streamrClient.subscribe(this.getStreamId(topic), (content: any, metadata: any) => {
            const payload = this.payloadFormat.createPayload(content, metadata.messageId)
            this.mqttServer.publish(topic, payload)
        })
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
