import { Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import {
    ConnectivityRequest, ConnectivityResponse,
    Message, MessageType
} from '../proto/packages/dht/protos/DhtRpc'
import { NatType } from './ConnectionManager'
import { ConnectionMode, ConnectivityChecker, connectAsync } from './ConnectivityChecker'
import { IConnection } from './IConnection'
import { ServerWebsocket } from './websocket/ServerWebsocket'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketConnector'

const logger = new Logger(module)

export const attachConnectivityRequestHandler = (connectionToListenTo: ServerWebsocket): void => {
    connectionToListenTo.on('data', (data: Uint8Array) => {
        logger.trace('server received data')
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'connectivityRequest') {
                logger.trace('ConnectivityRequest received: ' + JSON.stringify(Message.toJson(message)))
                handleIncomingConnectivityRequest(connectionToListenTo, message.body.connectivityRequest).then(() => {
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

const handleIncomingConnectivityRequest = async (connection: ServerWebsocket, connectivityRequest: ConnectivityRequest): Promise<void> => {
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
        outgoingConnection = await connectAsync({
            wsServerInfo,
            mode: ConnectionMode.PROBE,
            selfSigned: connectivityRequest.selfSigned
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
        messageType: MessageType.CONNECTIVITY_RESPONSE,
        messageId: v4(),
        body: {
            oneofKind: 'connectivityResponse',
            connectivityResponse: connectivityResponseMessage!
        }
    }
    connection.send(Message.toBinary(msg))
    logger.trace('ConnectivityResponse sent: ' + JSON.stringify(Message.toJson(msg)))
}
