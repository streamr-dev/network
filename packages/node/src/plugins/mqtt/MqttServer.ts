import * as aedes from 'aedes'
import * as net from 'net'
import util from 'util'
import { Logger } from '@streamr/utils'
import { ApiAuthentication, isValidAuthentication } from '../../apiAuthentication'
import Aedes from 'aedes'

const logger = new Logger(module)

export interface MqttServerListener {
    onMessageReceived(topic: string, payload: string, clientId: string): void
    onSubscribed(topics: string, clientId: string): void
    onUnsubscribed(topics: string, clientId: string): void
}

export class MqttServer {
    private static COMMAND_PUBLISH = 'publish'
    private static QOS_EXACTLY_ONCE = 2
    private static BAD_USERNAME_OR_PASSWORD = 4
    private static NOT_AUTHORIZED = 5

    private readonly port: number
    private readonly aedes: Aedes
    private server?: net.Server
    private listener?: MqttServerListener

    constructor(port: number, apiAuthentication?: ApiAuthentication) {
        this.port = port
        this.aedes = new Aedes({
            authenticate: MqttServer.createAuthenicationHandler(apiAuthentication)
        })
        this.aedes.on('publish', (packet, client) => {
            if (client !== null) {
                // is null if the this server sent the message
                this.listener?.onMessageReceived(packet.topic, packet.payload.toString(), client.id)
            }
        })
        this.aedes.on('subscribe', (subscriptions: aedes.Subscription[], client: aedes.Client) => {
            const topics = subscriptions.map((subscription) => subscription.topic)
            topics.forEach((topic) => this.listener?.onSubscribed(topic, client.id))
        })
        this.aedes.on('unsubscribe', (topics: string[], client: aedes.Client) => {
            topics.forEach((topic) => this.listener?.onUnsubscribed(topic, client.id))
        })
    }

    setListener(listener: MqttServerListener): void {
        this.listener = listener
    }

    async start(): Promise<void> {
        this.server = net.createServer(this.aedes.handle)
        await util.promisify((callback: any) => this.server!.listen(this.port, callback))()
        logger.info(`Started MQTT server on port ${this.port}`)
    }

    async stop(): Promise<void> {
        if (!this.aedes.closed) {
            const closeAedes = util.promisify((callback: any) => this.aedes.close(callback))()
            const closeServer = util.promisify((callback: any) => this.server!.close(callback))()
            await Promise.all([closeAedes, closeServer])
            logger.info('Stopped MQTT server')
        }
    }

    publish(topic: string, payload: string): void {
        const packet: aedes.PublishPacket = {
            topic,
            payload,
            cmd: MqttServer.COMMAND_PUBLISH as any,
            qos: MqttServer.QOS_EXACTLY_ONCE as any,
            dup: false,
            retain: false
        }
        this.aedes.publish(packet, (err?: Error) => {
            if (err) {
                logger.warn('Failed to publish', { err, topic })
            }
        })
    }

    private static createAuthenicationHandler(apiAuthentication?: ApiAuthentication): aedes.AuthenticateHandler {
        return (
            _client: aedes.Client,
            _username: Readonly<string> | undefined,
            password: Readonly<Buffer> | undefined,
            done: (error: aedes.AuthenticateError | null, success: boolean | null) => void
        ) => {
            if (isValidAuthentication(password?.toString(), apiAuthentication)) {
                done(null, true)
            } else {
                const error: aedes.AuthenticateError = Object.assign(new Error(), {
                    returnCode: password !== undefined ? MqttServer.BAD_USERNAME_OR_PASSWORD : MqttServer.NOT_AUTHORIZED
                })
                done(error, false)
            }
        }
    }
}
