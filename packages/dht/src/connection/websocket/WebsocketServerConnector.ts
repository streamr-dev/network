import { GeoIpLocator } from '@streamr/geoip-location'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Action, connectivityMethodToWebsocketUrl, WebsocketClientConnector } from './WebsocketClientConnector'
import { WebsocketServer } from './WebsocketServer'
import { areEqualPeerDescriptors, DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { AutoCertifierClientFacade } from './AutoCertifierClientFacade'
import { ConnectivityResponse, HandshakeError, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { ITransport } from '../../transport/ITransport'
import { ipv4ToNumber, Logger, wait } from '@streamr/utils'
import { attachConnectivityRequestHandler, DISABLE_CONNECTIVITY_PROBE } from '../connectivityRequestHandler'
import { WebsocketServerConnection } from './WebsocketServerConnection'
import { ConnectionType, IConnection } from '../IConnection'
import queryString from 'querystring'
import { isMaybeSupportedVersion, LOCAL_PROTOCOL_VERSION } from '../../helpers/version'
import { shuffle } from 'lodash'
import { sendConnectivityRequest } from '../connectivityChecker'
import { acceptHandshake, Handshaker, rejectHandshake } from '../Handshaker'
import { WebsocketClientConnectorRpcRemote } from './WebsocketClientConnectorRpcRemote'
import { WebsocketClientConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { WebsocketServerStartError } from '../../helpers/errors'
import * as Err from '../../helpers/errors'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { PendingConnection } from '../PendingConnection'

const logger = new Logger(module)

export interface WebsocketServerConnectorConfig {
    transport: ITransport
    onNewConnection: (connection: PendingConnection) => boolean
    onHandshakeCompleted: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
    hasConnection: (nodeId: DhtAddress) => boolean
    portRange?: PortRange
    maxMessageSize?: number
    host?: string
    entrypoints?: PeerDescriptor[]
    tlsCertificate?: TlsCertificate
    autoCertifierTransport: ITransport
    autoCertifierUrl: string
    autoCertifierConfigFile: string
    serverEnableTls: boolean
    geoIpDatabaseFolder?: string
}

export class WebsocketServerConnector {

    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly websocketServer?: WebsocketServer
    private geoIpLocator?: GeoIpLocator
    private readonly ongoingConnectRequests: Map<DhtAddress, PendingConnection> = new Map()
    private host?: string
    private autoCertifierClient?: AutoCertifierClientFacade
    private selectedPort?: number
    private localPeerDescriptor?: PeerDescriptor
    private abortController = new AbortController()
    private readonly config: WebsocketServerConnectorConfig

    constructor(config: WebsocketServerConnectorConfig) {
        this.config = config
        this.websocketServer = config.portRange ? new WebsocketServer({
            portRange: config.portRange,
            tlsCertificate: config.tlsCertificate,
            maxMessageSize: config.maxMessageSize,
            enableTls: config.serverEnableTls
        }) : undefined
        this.host = config.host
        this.rpcCommunicator = new ListeningRpcCommunicator(WebsocketClientConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
    }

    public async start(): Promise<void> {
        if (!this.abortController.signal.aborted && this.websocketServer) {
            this.websocketServer.on('connected', (connection: IConnection) => {
                const serverSocket = connection as unknown as WebsocketServerConnection
                const query = queryString.parse(serverSocket.resourceURL.query as string ?? '')
                const action = query.action as (Action | undefined)
                logger.trace('WebSocket client connected', { action, remoteAddress: serverSocket.getRemoteIpAddress() })
                if (action === 'connectivityRequest') {
                    attachConnectivityRequestHandler(serverSocket, this.geoIpLocator)
                } else if (action === 'connectivityProbe') {
                    // no-op
                } else {
                    // The localPeerDescriptor can be undefined here as the WS server is used for connectivity checks
                    // before the localPeerDescriptor is set during start.
                    // Handshaked connections should be rejected before the localPeerDescriptor is set.
                    // eslint-disable-next-line no-lonely-if
                    if (this.localPeerDescriptor !== undefined) {
                        this.attachHandshaker(connection)
                    } else {
                        logger.trace('incoming Websocket connection before localPeerDescriptor was set, closing connection')
                        connection.close(false).catch(() => {})
                    }
                }
            })
            
            if (this.config.geoIpDatabaseFolder) {
                const geoIpLocator = new GeoIpLocator(this.config.geoIpDatabaseFolder)
                try {
                    await geoIpLocator.start()
                    this.geoIpLocator = geoIpLocator
                } catch (err) {
                    logger.error('Failed to start GeoIpLocator', { err })
                }
            }

            const port = await this.websocketServer.start()
            this.selectedPort = port
        }
    }

    private attachHandshaker(connection: IConnection) {
        // TODO: use createIncomingHandshaker here?
        const handshaker = new Handshaker(this.localPeerDescriptor!, connection)
        handshaker.once('handshakeRequest', (localPeerDescriptor: PeerDescriptor, sourceVersion: string, remotePeerDescriptor?: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(localPeerDescriptor, connection, handshaker, sourceVersion, remotePeerDescriptor)
        })
    }

    private onServerSocketHandshakeRequest(
        sourcePeerDescriptor: PeerDescriptor,
        websocketServerConnection: IConnection,
        handshaker: Handshaker,
        remoteVersion: string,
        targetPeerDescriptor?: PeerDescriptor
    ) {
        const nodeId = getNodeIdFromPeerDescriptor(sourcePeerDescriptor)
        if (this.ongoingConnectRequests.has(nodeId)) {
            const ongoingConnectRequest = this.ongoingConnectRequests.get(nodeId)!
            if (!isMaybeSupportedVersion(remoteVersion)) {
                rejectHandshake(ongoingConnectRequest, websocketServerConnection, handshaker, HandshakeError.UNSUPPORTED_VERSION)  
            } else if (targetPeerDescriptor && !areEqualPeerDescriptors(this.localPeerDescriptor!, targetPeerDescriptor)) {
                rejectHandshake(ongoingConnectRequest, websocketServerConnection, handshaker, HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR)  
            } else {
                acceptHandshake(handshaker)
                this.config.onHandshakeCompleted(sourcePeerDescriptor, websocketServerConnection)
            }
            this.ongoingConnectRequests.delete(nodeId)
        } else {
            const pendingConnection = new PendingConnection(sourcePeerDescriptor)
            
            if (!isMaybeSupportedVersion(remoteVersion)) {
                rejectHandshake(pendingConnection, websocketServerConnection, handshaker, HandshakeError.UNSUPPORTED_VERSION)  
            } else if (targetPeerDescriptor && !areEqualPeerDescriptors(this.localPeerDescriptor!, targetPeerDescriptor)) {
                rejectHandshake(pendingConnection, websocketServerConnection, handshaker, HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR)  
            } else if (this.config.onNewConnection(pendingConnection)) {
                acceptHandshake(handshaker)
                this.config.onHandshakeCompleted(sourcePeerDescriptor, websocketServerConnection)
            } else {
                rejectHandshake(pendingConnection, websocketServerConnection, handshaker, HandshakeError.DUPLICATE_CONNECTION)
            }
        }
    }

    public async checkConnectivity(allowSelfSignedCertificate: boolean): Promise<ConnectivityResponse> {
        // TODO: this could throw?
        if (this.abortController.signal.aborted) {
            return {
                host: '127.0.0.1',
                natType: NatType.UNKNOWN,
                ipAddress: ipv4ToNumber('127.0.0.1'),
                version: LOCAL_PROTOCOL_VERSION
            }
        }
        if (!this.config.entrypoints || this.config.entrypoints.length === 0) {
            // return connectivity info given in config
            return {
                host: this.host!,
                natType: NatType.OPEN_INTERNET,
                websocket: {
                    host: this.host!,
                    port: this.selectedPort!,
                    tls: this.config.tlsCertificate !== undefined
                },
                // TODO: Resolve the given host name or or use as is if IP was given. 
                ipAddress: ipv4ToNumber('127.0.0.1'),
                version: LOCAL_PROTOCOL_VERSION
            }
        }
        const shuffledEntrypoints = shuffle(this.config.entrypoints)
        while (shuffledEntrypoints.length > 0 && !this.abortController.signal.aborted) {
            const entryPoint = shuffledEntrypoints[0]
            try {
                // Do real connectivity checking
                const connectivityRequest = {
                    port: this.selectedPort ?? DISABLE_CONNECTIVITY_PROBE,
                    host: this.host,
                    tls: this.websocketServer ? this.config.serverEnableTls : false,
                    allowSelfSignedCertificate
                }
                if (!this.abortController.signal.aborted) {
                    return await sendConnectivityRequest(connectivityRequest, entryPoint)
                } else {
                    throw new Err.ConnectionFailed('ConnectivityChecker is destroyed')
                }
            } catch (err) {
                const error = `Failed to connect to entrypoint with id ${getNodeIdFromPeerDescriptor(entryPoint)} `
                    + `and URL ${connectivityMethodToWebsocketUrl(entryPoint.websocket!)}`
                logger.error(error, { err })
                shuffledEntrypoints.shift()
                await wait(2000, this.abortController.signal)
            }
        }
        throw new WebsocketServerStartError(
            `Failed to connect to the entrypoints after ${this.config.entrypoints.length} attempts\n`
            + `Attempted hosts: ${this.config.entrypoints.map((entry) => `${entry.websocket!.host}:${entry.websocket!.port}`).join(', ')}`
        )
    }

    public async autoCertify(): Promise<void> {
        this.autoCertifierClient = new AutoCertifierClientFacade({
            configFile: this.config.autoCertifierConfigFile,
            transport: this.config.autoCertifierTransport,
            url: this.config.autoCertifierUrl,
            wsServerPort: this.selectedPort!,
            setHost: (hostName: string) => this.setHost(hostName),
            updateCertificate: (certificate: string, privateKey: string) => this.websocketServer!.updateCertificate(certificate, privateKey)
        })
        logger.trace(`AutoCertifying subdomain...`)
        await this.autoCertifierClient.start()
    }

    private setHost(hostName: string): void {
        logger.trace(`Setting host name to ${hostName}`)
        this.host = hostName
    }

    public connect(targetPeerDescriptor: PeerDescriptor): PendingConnection {
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        if (this.ongoingConnectRequests.has(nodeId)) {
            return this.ongoingConnectRequests.get(nodeId)!
        }
        return this.requestConnectionFromPeer(this.localPeerDescriptor!, targetPeerDescriptor)
    }

    private requestConnectionFromPeer(localPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): PendingConnection {
        setImmediate(() => {
            const remoteConnector = new WebsocketClientConnectorRpcRemote(
                localPeerDescriptor,
                targetPeerDescriptor,
                this.rpcCommunicator,
                WebsocketClientConnectorRpcClient
            )
            remoteConnector.requestConnection().then(() => {
                logger.trace('Sent WebsocketConnectionRequest notification to peer', { targetPeerDescriptor })
            }, (err) => {
                logger.debug('Failed to send WebsocketConnectionRequest notification to peer ', {
                    error: err, targetPeerDescriptor
                })
            })
        })
        const pendingConnection = new PendingConnection(targetPeerDescriptor)
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        // TODO: can this leak?
        pendingConnection.on('disconnected', () => this.ongoingConnectRequests.delete(nodeId))
        this.ongoingConnectRequests.set(nodeId, pendingConnection)
        return pendingConnection
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        const connectionType = expectedConnectionType(this.localPeerDescriptor!, targetPeerDescriptor)
        return (connectionType === ConnectionType.WEBSOCKET_SERVER)
    }

    public setLocalPeerDescriptor(localPeerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = localPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.abortController.abort()
        this.rpcCommunicator.destroy()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close(true)))

        await this.websocketServer?.stop()
        await this.geoIpLocator?.stop()
    }

}
