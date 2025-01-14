import { ipv4ToNumber, Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import { ConnectivityRequest, ConnectivityResponse, Message } from '../../generated/packages/dht/protos/DhtRpc'
import { NatType } from './ConnectionManager'
import { CONNECTIVITY_CHECKER_SERVICE_ID, connectAsync } from './connectivityChecker'
import { IConnection } from './IConnection'
import { WebsocketServerConnection } from './websocket/WebsocketServerConnection'
import { connectivityMethodToWebsocketUrl } from './websocket/WebsocketClientConnector'
import { LOCAL_PROTOCOL_VERSION } from '../helpers/version'
import { GeoIpLocator } from '@streamr/geoip-location'

export const DISABLE_CONNECTIVITY_PROBE = 0

const logger = new Logger(module)

export const attachConnectivityRequestHandler = (
    connectionToListenTo: WebsocketServerConnection,
    geoIpLocator?: GeoIpLocator
): void => {
    connectionToListenTo.on('data', async (data: Uint8Array) => {
        logger.trace('server received data')
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'connectivityRequest') {
                logger.trace('ConnectivityRequest received: ' + JSON.stringify(Message.toJson(message)))
                try {
                    await handleIncomingConnectivityRequest(
                        connectionToListenTo,
                        message.body.connectivityRequest,
                        geoIpLocator
                    )
                    logger.trace('handleIncomingConnectivityRequest ok')
                } catch (err1) {
                    logger.error('handleIncomingConnectivityRequest', { err: err1 })
                }
            }
        } catch (err2) {
            logger.trace('Could not parse message', { err: err2 })
        }
    })
}

const handleIncomingConnectivityRequest = async (
    connection: WebsocketServerConnection,
    connectivityRequest: ConnectivityRequest,
    geoIpLocator?: GeoIpLocator
): Promise<void> => {
    const host = connectivityRequest.host ?? connection.getRemoteIpAddress()
    const ipAddress = connection.getRemoteIpAddress()
    let connectivityResponse: ConnectivityResponse
    if (connectivityRequest.port !== DISABLE_CONNECTIVITY_PROBE) {
        connectivityResponse = await connectivityProbe(connectivityRequest, ipAddress, host)
    } else {
        logger.trace('ConnectivityRequest port is 0, replying without connectivityProbe')
        connectivityResponse = {
            host,
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            protocolVersion: LOCAL_PROTOCOL_VERSION
        }
    }
    if (geoIpLocator !== undefined) {
        const location = geoIpLocator.lookup(ipAddress)
        if (location !== undefined) {
            connectivityResponse.latitude = location.latitude
            connectivityResponse.longitude = location.longitude
        }
    }
    const msg: Message = {
        serviceId: CONNECTIVITY_CHECKER_SERVICE_ID,
        messageId: v4(),
        body: {
            oneofKind: 'connectivityResponse',
            connectivityResponse
        }
    }
    connection.send(Message.toBinary(msg))
    logger.trace('ConnectivityResponse sent: ' + JSON.stringify(Message.toJson(msg)))
}

const connectivityProbe = async (
    connectivityRequest: ConnectivityRequest,
    ipAddress: string,
    host: string
): Promise<ConnectivityResponse> => {
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
            allowSelfSignedCertificate: connectivityRequest.allowSelfSignedCertificate
        })
        logger.trace(
            'Connectivity test produced positive result, communicating reply to the requester ' +
                host +
                ':' +
                connectivityRequest.port
        )
        connectivityResponseMessage = {
            host,
            natType: NatType.OPEN_INTERNET,
            websocket: { host, port: connectivityRequest.port, tls: connectivityRequest.tls },
            ipAddress: ipv4ToNumber(ipAddress),
            protocolVersion: LOCAL_PROTOCOL_VERSION
        }
    } catch (err) {
        logger.debug('error', { err })
        connectivityResponseMessage = {
            host,
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            protocolVersion: LOCAL_PROTOCOL_VERSION
        }
    }
    if (outgoingConnection) {
        // TODO should we have some handling for this floating promise?
        outgoingConnection.close(false)
    }
    return connectivityResponseMessage
}
