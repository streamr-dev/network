import * as aedes from 'aedes'
import * as net from 'net'
import util from 'util'
import { ISubscription, IPublishPacket } from 'mqtt-packet'
import { Logger } from 'streamr-network'
import { ApiAuthenticator } from '../../apiAuthenticator'

const logger = new Logger(module)

export interface MqttServerListener {
    onMessageReceived(topic: string, payload: string): void
    onSubscribed(topics: string): void
    onUnsubscribed(topics: string): void
}

export class MqttServer {
    private static COMMAND_PUBLISH = 'publish'
    private static QOS_EXACTLY_ONCE = 2
    private static BAD_USERNAME_OR_PASSWORD = 4
    private static NOT_AUTHORIZED = 5

    private readonly port: number
    private readonly aedes: aedes.Aedes
    private server?: net.Server
    private listener?: MqttServerListener

    constructor(port: number, apiAuthenticator: ApiAuthenticator) {
        this.port = port
        this.aedes = aedes.Server({
            authenticate: MqttServer.createAuthenicationHandler(apiAuthenticator)
        })
        this.aedes.on('publish', (packet: IPublishPacket, client: aedes.Client) => {
            if (client !== null) {  // is null if the this server sent the message
                this.listener?.onMessageReceived(packet.topic, packet.payload.toString())
            }
        })
        this.aedes.on('subscribe', (subscriptions: ISubscription[]) => {
            const topics = subscriptions.map((subscription) => subscription.topic)
            topics.forEach((topic) => this.listener?.onSubscribed(topic))
        })
        this.aedes.on('unsubscribe', (topics: string[]) => {
            topics.forEach((topic) => this.listener?.onUnsubscribed(topic))
        })
    }

    setListener(listener: MqttServerListener) {
        this.listener = listener
    }

    async start() {
        this.server = net.createServer(this.aedes.handle)
        await util.promisify((callback: any) => this.server!.listen(this.port, callback))()
        logger.info(`MQTT server listening on port ${this.port}`)
    }

    async stop() {
        if (!this.aedes.closed) {
            const closeAedes = util.promisify((callback: any) => this.aedes.close(callback))()
            const closeServer = util.promisify((callback: any) => this.server!.close(callback))()
            await Promise.all([closeAedes, closeServer])
            logger.info('MQTT server stopped')
        }
    }

    publish(topic: string, payload: string) {
        const packet: aedes.PublishPacket = {
            topic,
            payload,
            cmd: MqttServer.COMMAND_PUBLISH as any,
            qos: MqttServer.QOS_EXACTLY_ONCE as any,
            dup: false,
            retain: false
        }
        this.aedes.publish(packet, (error?: Error) => {
            if (error) {
                logger.warn(`Publish error: ${error}`)
            }
        })
    }

    private static createAuthenicationHandler(apiAuthenticator: ApiAuthenticator): aedes.AuthenticateHandler {
        return (_client: aedes.Client, _username: Readonly<string>|undefined, password: Readonly<Buffer>|undefined, done: (error: aedes.AuthenticateError|null, success: boolean|null) => void) => {
            if (apiAuthenticator.isValidAuthentication(password?.toString())) {
                done(null, true)
            } else {
                const error: aedes.AuthenticateError = Object.assign(new Error(), { 
                    returnCode: (password !== undefined) ? MqttServer.BAD_USERNAME_OR_PASSWORD : MqttServer.NOT_AUTHORIZED
                })
                done(error, false)
            }
        }
    }
}
