import {
    ConnectivityMethod,
    ConnectivityRequest, ConnectivityResponse,
    Message, MessageType, PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionEvents, IConnection } from './IConnection'
import { Logger, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { ClientWebsocket } from './websocket/ClientWebsocket'
import { v4 } from 'uuid'
import { NatType } from './ConnectionManager'
import { ServerWebsocket } from './websocket/ServerWebsocket'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketConnectorRpcLocal'

const logger = new Logger(module)

// Class for handling both client and server side of the connectivity
// checks. This is attached to all ServerWebsockets to listen to
// ConnectivityRequest messages. 

export enum ConnectionMode { REQUEST = 'connectivityRequest', PROBE = 'connectivityProbe' }
export class ConnectivityChecker {

    private static readonly CONNECTIVITY_CHECKER_SERVICE_ID = 'system/connectivity-checker'
    private static readonly CONNECTIVITY_CHECKER_TIMEOUT = 5000
    private destroyed = false
    private readonly websocketPort: number
    private readonly tls: boolean 
    private readonly host?: string

    constructor(websocketPort: number, tls: boolean, host?: string) {
        this.websocketPort = websocketPort
        this.tls = tls
        this.host = host
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
            throw new Err.ConnectionFailed(`Failed to connect to the entrypoint ${connectivityMethodToWebsocketUrl(entryPoint.websocket!)}`, e)
        }
        // send connectivity request
        const connectivityRequestMessage: ConnectivityRequest = { port: this.websocketPort, host: this.host, tls: this.tls }
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
                    outgoingConnection.close(false)
                    reject(new Err.ConnectivityResponseTimeout('timeout'))
                }, ConnectivityChecker.CONNECTIVITY_CHECKER_TIMEOUT)
                const listener = (bytes: Uint8Array) => {
                    outgoingConnection.close(false)
                    try {
                        const message: Message = Message.fromBinary(bytes)
                        if (message.body.oneofKind === 'connectivityResponse') {
                            logger.trace('ConnectivityResponse received: ' + JSON.stringify(Message.toJson(message)))
                            const connectivityResponseMessage = message.body.connectivityResponse
                            outgoingConnection!.off('data', listener)
                            clearTimeout(timeoutId)
                            resolve(connectivityResponseMessage)
                        } else {
                            return
                        }
                    } catch (err) {
                        logger.trace(`Could not parse message: ${err}`)
                    }
                }
                outgoingConnection!.on('data', listener)
            })
        }
        try {
            const retPromise = responseAwaiter()
            outgoingConnection.send(Message.toBinary(msg))
            logger.trace('ConnectivityRequest sent: ' + JSON.stringify(Message.toJson(msg)))
            return await retPromise
        } catch (e) {
            logger.error('error getting connectivityresponse')
            throw e
        }
    }

    public listenToIncomingConnectivityRequests(connectionToListenTo: ServerWebsocket): void {
        connectionToListenTo.on('data', (data: Uint8Array) => {
            logger.trace('server received data')
            try {
                const message = Message.fromBinary(data)
                if (message.body.oneofKind === 'connectivityRequest') {
                    logger.trace('ConnectivityRequest received: ' + JSON.stringify(Message.toJson(message)))
                    this.handleIncomingConnectivityRequest(connectionToListenTo, message.body.connectivityRequest).then(() => {
                        logger.trace('handleIncomingConnectivityRequest ok')
                        return
                    }).catch((e) => {
                        logger.error('handleIncomingConnectivityRequest' + e)
                    })
                }
            } catch (err) {
                logger.trace(`Could not parse message: ${err}`)
            }
            
        })
    }

    private async handleIncomingConnectivityRequest(
        connection: ServerWebsocket,
        connectivityRequest: ConnectivityRequest
    ): Promise<void> {
        if (this.destroyed) {
            return
        }
        let outgoingConnection: IConnection | undefined
        let connectivityResponseMessage: ConnectivityResponse | undefined
        const host = connectivityRequest.host ?? connection.getRemoteAddress()
        try {
            const wsServerInfo = {
                host,
                port: connectivityRequest.port,
                tls: connectivityRequest.tls
            }
            logger.trace(`Attempting Connectivity Check to ${connectivityMethodToWebsocketUrl(wsServerInfo)}`)
            outgoingConnection = await this.connectAsync({
                wsServerInfo,
                mode: ConnectionMode.PROBE
            })
        } catch (err) {
            logger.debug('error', { err })
            connectivityResponseMessage = {
                host,
                natType: NatType.UNKNOWN
            }
        }
        if (outgoingConnection) {
            outgoingConnection.close(false)
            logger.trace('Connectivity test produced positive result, communicating reply to the requester ' + host + ':' + connectivityRequest.port)
            connectivityResponseMessage = {
                host,
                natType: NatType.OPEN_INTERNET,
                websocket: { host, port: connectivityRequest.port, tls: connectivityRequest.tls }
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
        logger.trace('ConnectivityResponse sent: ' + JSON.stringify(Message.toJson(msg)))
    }

    // eslint-disable-next-line class-methods-use-this
    private async connectAsync({ wsServerInfo, mode, timeoutMs = 1000, }:
        { wsServerInfo: ConnectivityMethod, mode: ConnectionMode, timeoutMs?: number }
    ): Promise<IConnection> {
        const socket = new ClientWebsocket()
        const url = `${connectivityMethodToWebsocketUrl(wsServerInfo)}?${mode}=true`
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
