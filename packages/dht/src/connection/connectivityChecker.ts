import { Logger, RunAndRaceEventsReturnType, runAndRaceEvents3 } from '@streamr/utils'
import { v4 } from 'uuid'
import * as Err from '../helpers/errors'
import {
    ConnectivityRequest,
    ConnectivityResponse,
    Message,
    PeerDescriptor
} from '../../generated/packages/dht/protos/DhtRpc'
import { ConnectionEvents, IConnection } from './IConnection'
import { WebsocketClientConnection } from './websocket/NodeWebsocketClientConnection'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketClientConnector'
import { isMaybeSupportedProtocolVersion } from '../helpers/version'

const logger = new Logger(module)

// TODO use options option or named constant?
export const connectAsync = async ({
    url,
    allowSelfSignedCertificate,
    timeoutMs = 1000
}: {
    url: string
    allowSelfSignedCertificate: boolean
    timeoutMs?: number
}): Promise<IConnection> => {
    const socket = new WebsocketClientConnection()
    let result: RunAndRaceEventsReturnType<ConnectionEvents>
    try {
        result = await runAndRaceEvents3<ConnectionEvents>(
            [
                () => {
                    socket.connect(url, allowSelfSignedCertificate)
                }
            ],
            socket,
            ['connected', 'error'],
            timeoutMs
        )
    } catch {
        throw new Err.ConnectionFailed('WebSocket connection timed out')
    }
    if (result.winnerName === 'error') {
        throw new Err.ConnectionFailed('Could not open WebSocket connection')
    }
    return socket
}

export const CONNECTIVITY_CHECKER_SERVICE_ID = 'system/connectivity-checker'
const CONNECTIVITY_CHECKER_TIMEOUT = 5000

export const sendConnectivityRequest = async (
    request: ConnectivityRequest,
    entryPoint: PeerDescriptor
): Promise<ConnectivityResponse> => {
    let outgoingConnection: IConnection
    const wsServerInfo = {
        host: entryPoint.websocket!.host,
        port: entryPoint.websocket!.port,
        tls: entryPoint.websocket!.tls
    }
    const url = connectivityMethodToWebsocketUrl(wsServerInfo, 'connectivityRequest')
    logger.debug(`Attempting connectivity check with entrypoint ${url}`)
    try {
        outgoingConnection = await connectAsync({
            url,
            allowSelfSignedCertificate: request.allowSelfSignedCertificate
        })
    } catch (e) {
        throw new Err.ConnectionFailed(`Failed to connect to entrypoint for connectivity check: ${url}`, e)
    }
    // send connectivity request
    const msg: Message = {
        serviceId: CONNECTIVITY_CHECKER_SERVICE_ID,
        messageId: v4(),
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
            }, CONNECTIVITY_CHECKER_TIMEOUT)
            const listener = (bytes: Uint8Array) => {
                // TODO should we have some handling for this floating promise?
                outgoingConnection.close(false)
                try {
                    const message: Message = Message.fromBinary(bytes)
                    if (message.body.oneofKind === 'connectivityResponse') {
                        logger.debug('ConnectivityResponse received: ' + JSON.stringify(Message.toJson(message)))
                        const connectivityResponseMessage = message.body.connectivityResponse
                        const remoteProtocolVersion = connectivityResponseMessage.protocolVersion
                        outgoingConnection!.off('data', listener)
                        clearTimeout(timeoutId)
                        if (isMaybeSupportedProtocolVersion(remoteProtocolVersion)) {
                            resolve(connectivityResponseMessage)
                        } else {
                            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                            reject(`Unsupported version: ${remoteProtocolVersion}`)
                        }
                    }
                } catch (err) {
                    logger.trace('Could not parse message', { err })
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
