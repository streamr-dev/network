import { Logger, RunAndRaceEventsReturnType, runAndRaceEvents3 } from '@streamr/utils'
import { v4 } from 'uuid'
import * as Err from '../helpers/errors'
import {
    ConnectivityRequest, ConnectivityResponse,
    Message, MessageType, PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionEvents, IConnection } from './IConnection'
import { ClientWebsocket } from './websocket/ClientWebsocket'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketConnector'

const logger = new Logger(module)

export const connectAsync = async ({ url, selfSigned, timeoutMs = 1000 }:
    { url: string, selfSigned: boolean, timeoutMs?: number }
): Promise<IConnection> => {
    const socket = new ClientWebsocket()
    let result: RunAndRaceEventsReturnType<ConnectionEvents>
    try {
        result = await runAndRaceEvents3<ConnectionEvents>([
            () => { socket.connect(url, selfSigned) }],
        socket, ['connected', 'error'],
        timeoutMs)
    } catch (e) {
        throw new Err.ConnectionFailed('WebSocket connection timed out')
    }
    if (result.winnerName === 'error') {
        throw new Err.ConnectionFailed('Could not open WebSocket connection')
    }
    return socket
}

export class ConnectivityChecker {

    public static readonly CONNECTIVITY_CHECKER_SERVICE_ID = 'system/connectivity-checker'
    private static readonly CONNECTIVITY_CHECKER_TIMEOUT = 5000
    private destroyed = false

    public async sendConnectivityRequest(
        request: ConnectivityRequest,
        entryPoint: PeerDescriptor,
        selfSigned: boolean
    ): Promise<ConnectivityResponse> {
        if (this.destroyed) {
            throw new Err.ConnectionFailed('ConnectivityChecker is destroyed')
        }
        let outgoingConnection: IConnection
        const wsServerInfo = {
            host: entryPoint.websocket!.host, 
            port: entryPoint.websocket!.port,
            tls: entryPoint.websocket!.tls,
        }
        const url = connectivityMethodToWebsocketUrl(wsServerInfo, 'connectivityRequest')
        try {
            outgoingConnection = await connectAsync({
                url,
                selfSigned
            })
        } catch (e) {
            throw new Err.ConnectionFailed(`Failed to connect to the entrypoint ${url}`, e)
        }
        // send connectivity request
        const msg: Message = {
            serviceId: ConnectivityChecker.CONNECTIVITY_CHECKER_SERVICE_ID,
            messageType: MessageType.CONNECTIVITY_REQUEST, messageId: v4(),
            body: {
                oneofKind: 'connectivityRequest',
                connectivityRequest: request
            }
        }
        const responseAwaiter = () => {
            return new Promise((resolve: (res: ConnectivityResponse) => void, reject) => {
                const timeoutId = setTimeout(() => {
                    // TODO should we have some handling for this floating promise?
                    outgoingConnection.close(false)
                    reject(new Err.ConnectivityResponseTimeout('timeout'))
                }, ConnectivityChecker.CONNECTIVITY_CHECKER_TIMEOUT)
                const listener = (bytes: Uint8Array) => {
                    // TODO should we have some handling for this floating promise?
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

    public destroy(): void {
        this.destroyed = true
    }
}
