import {
    ConnectivityMethod,
    ConnectivityRequest, ConnectivityResponse,
    Message, MessageType, PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionEvents, IConnection } from './IConnection'
import { Logger, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { ClientWebSocket } from './WebSocket/ClientWebSocket'
import { v4 } from 'uuid'
import { NatType } from './ConnectionManager'
import { ServerWebSocket } from './WebSocket/ServerWebSocket'
import { connectivityMethodToWebSocketUrl } from './WebSocket/WebSocketConnector'

const logger = new Logger(module)

// Class for handling both client and server side of the connectivity
// checks. This is attached to all ServerWebSockets to listen to
// ConnectivityRequest messages. 

export enum ConnectionMode { REQUEST = 'connectivityRequest', PROBE = 'connectivityProbe' }
export class ConnectivityChecker {

    private static readonly CONNECTIVITY_CHECKER_SERVICE_ID = 'system/connectivitychecker'
    private static readonly CONNECTIVITY_CHECKER_TIMEOUT = 5000
    private destroyed = false
    private readonly webSocketPort: number
    private readonly tls: boolean 

    constructor(webSocketPort: number, tls: boolean) {
        this.webSocketPort = webSocketPort
        this.tls = tls
    }

    public async sendConnectivityRequest(entryPoint: PeerDescriptor): Promise<ConnectivityResponse> {
        if (this.destroyed) {
            throw new Err.ConnectionFailed('ConnectivityChecker is destroyed')
        }
        let outgoingConnection: IConnection
        try {
            outgoingConnection = await this.connectAsync({
                wsServerInfo: {
                    host: entryPoint.websocket!.host, 
                    port: entryPoint.websocket!.port,
                    tls: entryPoint.websocket!.tls,
                },
                mode: ConnectionMode.REQUEST
            })
        } catch (e) {
            throw new Err.ConnectionFailed('Failed to connect to the entrypoints', e)
        }
        // send connectivity request
        const connectivityRequestMessage: ConnectivityRequest = { port: this.webSocketPort, tls: this.tls }
        const msg: Message = {
            serviceId: ConnectivityChecker.CONNECTIVITY_CHECKER_SERVICE_ID,
            messageType: MessageType.CONNECTIVITY_REQUEST, messageId: v4(),
            body: {
                oneofKind: 'connectivityRequest',
                connectivityRequest: connectivityRequestMessage
            }
        }
        const responseAwaiter = () => {
            return new Promise((resolve: (res: ConnectivityResponse) => void, reject) => {
                const timeoutId = setTimeout(() => {
                    outgoingConnection.close('OTHER')
                    reject(new Err.ConnectivityResponseTimeout('timeout'))
                }, ConnectivityChecker.CONNECTIVITY_CHECKER_TIMEOUT)
                const listener = (bytes: Uint8Array) => {
                    outgoingConnection.close('OTHER')
                    const message: Message = Message.fromBinary(bytes)
                    if (message.body.oneofKind === 'connectivityResponse') {
                        const connectivityResponseMessage = message.body.connectivityResponse
                        outgoingConnection!.off('data', listener)
                        clearTimeout(timeoutId)
                        resolve(connectivityResponseMessage)
                    } else {
                        return
                    }
                }
                outgoingConnection!.on('data', listener)
            })
        }
        try {
            const retPromise = responseAwaiter()
            logger.trace('trying to send connectivity request')
            outgoingConnection.send(Message.toBinary(msg))
            logger.debug('connectivity request sent: ' + JSON.stringify(Message.toJson(msg)))
            return await retPromise
        } catch (e) {
            logger.error('error getting connectivityresponse')
            throw e
        }
    }

    public listenToIncomingConnectivityRequests(connectionToListenTo: ServerWebSocket): void {
        connectionToListenTo.on('data', (data: Uint8Array) => {
            logger.trace('server received data')
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'connectivityRequest') {
                logger.trace('received connectivity request')
                this.handleIncomingConnectivityRequest(connectionToListenTo, message.body.connectivityRequest).then(() => {
                    logger.trace('handleIncomingConnectivityRequest ok')
                    return
                }).catch((e) => {
                    logger.error('handleIncomingConnectivityRequest' + e)
                })
            }
        })
    }

    private async handleIncomingConnectivityRequest(
        connection: ServerWebSocket,
        connectivityRequest: ConnectivityRequest
    ): Promise<void> {
        if (this.destroyed) {
            return
        }
        let outgoingConnection: IConnection | undefined
        let connectivityResponseMessage: ConnectivityResponse | undefined
        try {
            outgoingConnection = await this.connectAsync({
                wsServerInfo: {
                    host: connection.getRemoteAddress(),
                    port: connectivityRequest.port,
                    tls: connectivityRequest.tls
                },
                mode: ConnectionMode.PROBE
            })
        } catch (err) {
            logger.debug('error', { err })
            connectivityResponseMessage = {
                openInternet: false,
                host: connection.getRemoteAddress(),
                natType: NatType.UNKNOWN
            }
        }
        if (outgoingConnection) {
            outgoingConnection.close('OTHER')
            logger.trace('Connectivity test produced positive result, communicating reply to the requester')
            connectivityResponseMessage = {
                openInternet: true,
                host: connection.getRemoteAddress(),
                natType: NatType.OPEN_INTERNET,
                websocket: { host: connection.getRemoteAddress(), port: connectivityRequest.port, tls: connectivityRequest.tls }
            }
        }
        const msg: Message = {
            serviceId: ConnectivityChecker.CONNECTIVITY_CHECKER_SERVICE_ID,
            messageType: MessageType.CONNECTIVITY_RESPONSE, messageId: v4(),
            body: {
                oneofKind: 'connectivityResponse',
                connectivityResponse: connectivityResponseMessage!
            }
        }
        connection.send(Message.toBinary(msg))
    }

    // eslint-disable-next-line class-methods-use-this
    private async connectAsync({ wsServerInfo, mode, timeoutMs = 1000, }:
        { wsServerInfo: ConnectivityMethod, mode: ConnectionMode, timeoutMs?: number }
    ): Promise<IConnection> {
        const socket = new ClientWebSocket()
        const url = `${connectivityMethodToWebSocketUrl(wsServerInfo)}?${mode}=true`
        let result: RunAndRaceEventsReturnType<ConnectionEvents>
        try {
            result = await runAndRaceEvents3<ConnectionEvents>([
                () => { socket.connect(url) }],
            socket, ['connected', 'error'],
            timeoutMs)
        } catch (e) {
            throw (new Err.ConnectionFailed('WebSocket connection timed out'))
        }
        if (result.winnerName === 'error') {
            throw (new Err.ConnectionFailed('Could not open WebSocket connection'))
        }
        return socket
    }

    public destroy(): void {
        this.destroyed = true
    }
}
