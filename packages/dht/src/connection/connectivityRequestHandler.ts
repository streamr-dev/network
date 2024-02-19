import { ipv4ToNumber, Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import {
    ConnectivityRequest, ConnectivityResponse,
    Message, MessageType
} from '../proto/packages/dht/protos/DhtRpc'
import { NatType } from './ConnectionManager'
import { CONNECTIVITY_CHECKER_SERVICE_ID, connectAsync } from './connectivityChecker'
import { IConnection } from './IConnection'
import { ServerWebsocket } from './websocket/ServerWebsocket'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketConnector'
import { version as localVersion } from '../../package.json'

export const DISABLE_CONNECTIVITY_PROBE = 0

const logger = new Logger(module)

export const attachConnectivityRequestHandler = (connectionToListenTo: ServerWebsocket): void => {
    connectionToListenTo.on('data', async (data: Uint8Array) => {
        logger.info('server received data')
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'connectivityRequest') {
                logger.trace('ConnectivityRequest received: ' + JSON.stringify(Message.toJson(message)))
                try {
                    await handleIncomingConnectivityRequest(connectionToListenTo, message.body.connectivityRequest)
                    logger.trace('handleIncomingConnectivityRequest ok')
                } catch (e) {
                    logger.error('handleIncomingConnectivityRequest', { error: e })
                }
            }
        } catch (err) {
            logger.trace(`Could not parse message: ${err}`)
        }
    })
}

const handleIncomingConnectivityRequest = async (connection: ServerWebsocket, connectivityRequest: ConnectivityRequest): Promise<void> => {
    const host = connectivityRequest.host ?? connection.remoteAddress
    const ipAddress = connection.getRemoteIp()
    let connectivityResponse: ConnectivityResponse
    if (connectivityRequest.port !== DISABLE_CONNECTIVITY_PROBE) {
        connectivityResponse = await connectivityProbe(connectivityRequest, ipAddress, host)

    } else {
        logger.trace('ConnectivityRequest port is 0, replying without connectivityProbe')
        connectivityResponse = {
            host,
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            version: localVersion
        }

    }
    const msg: Message = {
        serviceId: CONNECTIVITY_CHECKER_SERVICE_ID,
        messageType: MessageType.CONNECTIVITY_RESPONSE,
        messageId: v4(),
        body: {
            oneofKind: 'connectivityResponse',
            connectivityResponse
        }
    }
    connection.send(Message.toBinary(msg))
    logger.trace('ConnectivityResponse sent: ' + JSON.stringify(Message.toJson(msg)))
}

const connectivityProbe = async (connectivityRequest: ConnectivityRequest, ipAddress: string, host: string): Promise<ConnectivityResponse> => {
    let outgoingConnection: IConnection | undefined
    let connectivityResponseMessage: ConnectivityResponse
    try {
        const wsServerInfo = {
            host,
            port: connectivityRequest.port,
            tls: connectivityRequest.tls
        }
        const url = connectivityMethodToWebsocketUrl(wsServerInfo, 'connectivityProbe')
        logger.trace(`Attempting Connectivity Check to ${url}`)
        outgoingConnection = await connectAsync({
            url,
            selfSigned: connectivityRequest.selfSigned
        })
        logger.trace('Connectivity test produced positive result, communicating reply to the requester ' + host + ':' + connectivityRequest.port)
        connectivityResponseMessage = {
            host,
            natType: NatType.OPEN_INTERNET,
            websocket: { host, port: connectivityRequest.port, tls: connectivityRequest.tls },
            ipAddress: ipv4ToNumber(ipAddress),
            version: localVersion
        }
    } catch (err) {
        logger.debug('error', { err })
        connectivityResponseMessage = {
            host,
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            version: localVersion
        }
    }
    if (outgoingConnection) {
        // TODO should we have some handling for this floating promise?
        outgoingConnection.close(false)
    }
    return connectivityResponseMessage
}
