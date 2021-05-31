import { StreamrClient, Subscription } from 'streamr-client'
import { Logger } from 'streamr-network'
import { MqttServer, MqttServerListener } from './MqttServer'

const logger = new Logger(module)

export class Bridge implements MqttServerListener {

    private readonly streamrClient: StreamrClient
    private readonly mqttServer: MqttServer
    private readonly streamIdDomain?: string

    constructor(streamrClient: StreamrClient, mqttServer: MqttServer, streamIdDomain?: string) {
        this.streamrClient = streamrClient
        this.mqttServer = mqttServer
        this.streamIdDomain = streamIdDomain
    }

    onMessageReceived(topic: string, payload: string): void {
        let json
        try {
            json = JSON.parse(payload)
        } catch (e) {
            logger.warn('Unable to publish message: JSON syntax error')
            return
        }
        const { message, metadata } = json
        if (message === undefined) {
            logger.warn('Unable to publish message: no "message" field in JSON')
            return
        }
        this.streamrClient.publish(this.getStreamId(topic), message, metadata?.timestamp)
    }
    
    onSubscribed(topic: string): void {
        logger.info('Client subscribed: ' + topic)
        this.streamrClient.subscribe(this.getStreamId(topic), (message: any, metadata: any) => {
            const payload = JSON.stringify({
                message,
                metadata: {
                    timestamp: metadata.messageId.timestamp
                }
            })
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
