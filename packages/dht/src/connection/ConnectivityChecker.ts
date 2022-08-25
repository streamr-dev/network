import { ConnectivityRequestMessage, ConnectivityResponseMessage, Message, MessageType, PeerDescriptor } from '../proto/DhtRpc'
import { Event as ConnectionEvents, IConnection } from './IConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { ClientWebSocket } from './WebSocket/ClientWebSocket'
import { v4 } from 'uuid'
import { NatType } from './ConnectionManager'
import { ServerWebSocket } from './WebSocket/ServerWebSocket'

const logger = new Logger(module)

// Class for handling both client and server side of the connectivity
// checks. This is attached to all ServerWebSockets to listen to
// ConnectivityRequest messages. 

export class ConnectivityChecker {

    private static CONNECTIVITY_CHECKER_SERVICE_ID = 'connectivitychecker'
    private static CONNECTIVITY_CHECKER_TIMEOUT = 5000
    private stopped = false

    constructor(private webSocketPort?: number) {
    }

    public async sendConnectivityRequest(entryPoint: PeerDescriptor): Promise<ConnectivityResponseMessage> {
        let outgoingConnection: IConnection | null = null

        try {
            outgoingConnection = await this.connectAsync({
                host: entryPoint.websocket?.ip, port: entryPoint.websocket?.port, timeoutMs: 1000
            })
        } catch (e) {
            logger.error("Failed to connect to the entrypoints")
            throw new Err.ConnectionFailed("Failed to connect to the entrypoints", e)
        }

        // send connectivity request
        const connectivityRequestMessage: ConnectivityRequestMessage = { port: this.webSocketPort! }
        const msg: Message = {
            serviceId: ConnectivityChecker.CONNECTIVITY_CHECKER_SERVICE_ID,
            messageType: MessageType.CONNECTIVITY_REQUEST, messageId: 'xyz',
            body: ConnectivityRequestMessage.toBinary(connectivityRequestMessage)
        }

        const responseAwaiter = () => {
            return new Promise((resolve: (res: ConnectivityResponseMessage) => void, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Err.ConnectivityResponseTimeout('timeout'))
                }, ConnectivityChecker.CONNECTIVITY_CHECKER_TIMEOUT)
                const listener = (bytes: Uint8Array) => {
                    const message: Message = Message.fromBinary(bytes)
                    if (message.messageType != MessageType.CONNECTIVITY_RESPONSE) {
                        return
                    }
                    const connectivityResponseMessage = ConnectivityResponseMessage.fromBinary(message.body)
                    outgoingConnection!.off(ConnectionEvents.DATA, listener)
                    clearTimeout(timeoutId)
                    resolve(connectivityResponseMessage) //(connectivityResponseMessage)
                }
                outgoingConnection!.on(ConnectionEvents.DATA, listener)
            })
        }
        try {
            const retPromise = responseAwaiter()

            logger.trace('trying to send connectivity request')
            outgoingConnection.send(Message.toBinary(msg))
            logger.info('connectivity request sent: ' + JSON.stringify(Message.toJson(msg)))

            return await retPromise
        } catch (e) {
            logger.info('error getting connectivityresponse')
            throw e
        }
    }

    public listenToIncomingConnectivityRequests(connectionToListenTo: ServerWebSocket): void {

        connectionToListenTo.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
            logger.trace('server received data')
            const message = Message.fromBinary(data)

            if (message.messageType === MessageType.CONNECTIVITY_REQUEST) {
                logger.trace('received connectivity request')
                this.handleIncomingConnectivityRequest(connectionToListenTo, ConnectivityRequestMessage.fromBinary(message.body))
            }
        })
    }

    private async handleIncomingConnectivityRequest(
        connection: ServerWebSocket,
        connectivityRequest: ConnectivityRequestMessage
    ): Promise<void> {
        if (this.stopped) {
            return
        }
        let outgoingConnection: IConnection | null = null
        let connectivityResponseMessage: ConnectivityResponseMessage | null = null
        try {
            outgoingConnection = await this.connectAsync({
                host: connection.getRemoteAddress(),
                port: connectivityRequest.port, timeoutMs: 1000
            })
        } catch (e) {
            logger.trace("Connectivity test produced negative result, communicating reply to the requester")
            logger.debug(e)

            connectivityResponseMessage = {
                openInternet: false,
                ip: (connection as ServerWebSocket).getRemoteAddress(),
                natType: NatType.UNKNOWN
            }
        }

        if (outgoingConnection) {
            outgoingConnection.close()

            logger.trace("Connectivity test produced positive result, communicating reply to the requester")

            connectivityResponseMessage = {
                openInternet: true,
                ip: (connection as ServerWebSocket).getRemoteAddress(),
                natType: NatType.OPEN_INTERNET,
                websocket: { ip: (connection as ServerWebSocket).getRemoteAddress(), port: connectivityRequest.port }
            }
        }

        const msg: Message = {
            serviceId: ConnectivityChecker.CONNECTIVITY_CHECKER_SERVICE_ID,
            messageType: MessageType.CONNECTIVITY_RESPONSE, messageId: v4(),
            body: ConnectivityResponseMessage.toBinary(connectivityResponseMessage!)
        }
        connection.send(Message.toBinary(msg))
    }

    private connectAsync({ host, port, url, timeoutMs }:
        { host?: string, port?: number, url?: string, timeoutMs: number } = { timeoutMs: 1000 }): Promise<IConnection> {

        return new Promise((resolve, reject) => {
            const socket = new ClientWebSocket()

            const connectHandler = () => {
                clearTimeout(timeout)
                socket.off(ConnectionEvents.ERROR, errorHandler)
                resolve(socket)
            }

            const errorHandler = () => {
                clearTimeout(timeout)
                reject(new Err.ConnectionFailed('Could not open WebSocket connection'))
            }

            const timeoutHandler = () => {
                socket.off(ConnectionEvents.ERROR, errorHandler)
                reject(new Err.ConnectionFailed('WebSocket connection timed out'))
            }

            const timeout = setTimeout(timeoutHandler, timeoutMs)

            socket.once(ConnectionEvents.CONNECTED, connectHandler)
            socket.once(ConnectionEvents.ERROR, errorHandler)

            let address = ''
            if (url) {
                address = url
            } else if (host && port) {
                address = 'ws://' + host + ':' + port
            }

            socket.connect(address)
        })
    }
}
