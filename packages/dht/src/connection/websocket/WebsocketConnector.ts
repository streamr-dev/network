import { ClientWebsocket } from './ClientWebsocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { WebsocketConnectorRpcLocal } from './WebsocketConnectorRpcLocal'
import { WebsocketConnectorRpcRemote } from './WebsocketConnectorRpcRemote'
import {
    ConnectivityMethod,
    ConnectivityResponse,
    HandshakeError,
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { ipv4ToNumber, Logger, wait } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { WebsocketServer } from './WebsocketServer'
import { sendConnectivityRequest } from '../connectivityChecker'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { ServerWebsocket } from './ServerWebsocket'
import { Handshaker } from '../Handshaker'
import { ParsedUrlQuery } from 'querystring'
import { range, sample } from 'lodash'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { WebsocketServerStartError } from '../../helpers/errors'
import { AutoCertifierClientFacade } from './AutoCertifierClientFacade'
import { attachConnectivityRequestHandler } from '../connectivityRequestHandler'
import * as Err from '../../helpers/errors'
import { Empty } from '../../proto/google/protobuf/empty'
import { DhtAddress, areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { version } from '../../../package.json'
import { isCompatibleVersion } from '../../helpers/versionCompatibility'

const logger = new Logger(module)

export type Action = 'connectivityRequest' | 'connectivityProbe'

export const connectivityMethodToWebsocketUrl = (ws: ConnectivityMethod, action?: Action): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port + ((action !== undefined) ? '?action=' + action : '')
}

const ENTRY_POINT_CONNECTION_ATTEMPTS = 5

export interface WebsocketConnectorConfig {
    transport: ITransport
    onNewConnection: (connection: ManagedConnection) => boolean
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
}

export class WebsocketConnector {

    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocket-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly websocketServer?: WebsocketServer
    private readonly ongoingConnectRequests: Map<DhtAddress, ManagedConnection> = new Map()
    private host?: string
    private autoCertifierClient?: AutoCertifierClientFacade
    private selectedPort?: number
    private localPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<DhtAddress, ManagedConnection> = new Map()
    private abortController = new AbortController()
    private readonly config: WebsocketConnectorConfig

    constructor(config: WebsocketConnectorConfig) {
        this.config = config
        this.websocketServer = config.portRange ? new WebsocketServer({
            portRange: config.portRange,
            tlsCertificate: config.tlsCertificate,
            maxMessageSize: config.maxMessageSize,
            enableTls: config.serverEnableTls
        }) : undefined
        this.host = config.host
        this.rpcCommunicator = new ListeningRpcCommunicator(WebsocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: WebsocketConnectorConfig) {
        const rpcLocal = new WebsocketConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            hasConnection: (nodeId: DhtAddress): boolean => {
                if (this.connectingConnections.has(nodeId)
                    || this.connectingConnections.has(nodeId)
                    || this.ongoingConnectRequests.has(nodeId)
                    || config.hasConnection(nodeId)
                ) {
                    return true
                } else {
                    return false
                }
            },
            onNewConnection: (connection: ManagedConnection) => config.onNewConnection(connection),
            abortSignal: this.abortController.signal
        })
        this.rpcCommunicator.registerRpcNotification(
            WebsocketConnectionRequest,
            'requestConnection',
            async (req: WebsocketConnectionRequest, context: ServerCallContext): Promise<Empty> => {
                if (!this.abortController.signal.aborted) {
                    return rpcLocal.requestConnection(req, context)
                } else {
                    return {}
                }
            }
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.localPeerDescriptor!, connection)
        handshaker.once('handshakeRequest', (localPeerDescriptor: PeerDescriptor, sourceVersion: string, remotePeerDescriptor?: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(localPeerDescriptor, connection, sourceVersion, remotePeerDescriptor)
        })
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

    public async start(): Promise<void> {
        if (!this.abortController.signal.aborted && this.websocketServer) {
            this.websocketServer.on('connected', (connection: IConnection) => {
                const serverSocket = connection as unknown as ServerWebsocket
                const query = serverSocket.resourceURL.query as unknown as (ParsedUrlQuery | null)
                const action = query?.action as (Action | undefined)
                logger.trace('WebSocket client connected', { action, remoteAddress: serverSocket.getRemoteAddress() })
                if (action === 'connectivityRequest') {
                    attachConnectivityRequestHandler(serverSocket)
                } else if (action === 'connectivityProbe') {
                    // no-op
                } else {
                    this.attachHandshaker(connection)
                }
            })
            const port = await this.websocketServer.start()
            this.selectedPort = port
        }
    }

    public async checkConnectivity(selfSigned: boolean): Promise<ConnectivityResponse> {
        // TODO: this could throw if the server is not running
        const noServerConnectivityResponse: ConnectivityResponse = {
            host: '127.0.0.1',
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber('127.0.0.1'),
            version
        }
        if (this.abortController.signal.aborted) {
            return noServerConnectivityResponse
        }
        for (const reattempt of range(ENTRY_POINT_CONNECTION_ATTEMPTS)) {
            const entryPoint = sample(this.config.entrypoints)!
            try {
                if (!this.websocketServer) {
                    return noServerConnectivityResponse
                } else {
                    if (!this.config.entrypoints || this.config.entrypoints.length === 0) {
                        // return connectivity info given in config
                        const preconfiguredConnectivityResponse: ConnectivityResponse = {
                            host: this.host!,
                            natType: NatType.OPEN_INTERNET,
                            websocket: { host: this.host!, port: this.selectedPort!, tls: this.config.tlsCertificate !== undefined },
                            // TODO: maybe do a DNS lookup here?
                            ipAddress: ipv4ToNumber('127.0.0.1'),
                            version
                        }
                        return preconfiguredConnectivityResponse
                    } else {
                        // Do real connectivity checking
                        const connectivityRequest = {
                            port: this.selectedPort!,
                            host: this.host,
                            tls: this.config.serverEnableTls,
                            selfSigned
                        }
                        if (!this.abortController.signal.aborted) {
                            return await sendConnectivityRequest(connectivityRequest, entryPoint, version)
                        } else {
                            throw new Err.ConnectionFailed('ConnectivityChecker is destroyed')
                        }
                    }
                }
            } catch (err) {
                if (reattempt < ENTRY_POINT_CONNECTION_ATTEMPTS) {
                    const error = `Failed to connect to entrypoint with id ${getNodeIdFromPeerDescriptor(entryPoint)} `
                        + `and URL ${connectivityMethodToWebsocketUrl(entryPoint.websocket!)}`
                    logger.error(error, { error: err })
                    await wait(2000)
                }
            }
        }
        throw new WebsocketServerStartError(`Failed to connect to the entrypoints after ${ENTRY_POINT_CONNECTION_ATTEMPTS} attempts`)
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        const connectionType = expectedConnectionType(this.localPeerDescriptor!, targetPeerDescriptor)
        return (connectionType === ConnectionType.WEBSOCKET_CLIENT || connectionType === ConnectionType.WEBSOCKET_SERVER)
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }

        if (this.localPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.localPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebsocket()

            const url = connectivityMethodToWebsocketUrl(targetPeerDescriptor.websocket!)

            const managedConnection = new ManagedConnection(
                this.localPeerDescriptor!,
                ConnectionType.WEBSOCKET_CLIENT,
                socket,
                undefined,
                targetPeerDescriptor
            )
            managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)

            this.connectingConnections.set(nodeId, managedConnection)

            const delFunc = () => {
                if (this.connectingConnections.has(nodeId)) {
                    this.connectingConnections.delete(nodeId)
                }
                socket.off('disconnected', delFunc)
                managedConnection.off('handshakeCompleted', delFunc)
            }
            socket.on('disconnected', delFunc)
            managedConnection.on('handshakeCompleted', delFunc)

            socket.connect(url)

            return managedConnection
        }
    }

    private requestConnectionFromPeer(localPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new WebsocketConnectorRpcRemote(
                localPeerDescriptor,
                targetPeerDescriptor,
                this.rpcCommunicator,
                WebsocketConnectorRpcClient
            )
            remoteConnector.requestConnection().then(() => {
                logger.trace('Sent WebsocketConnectionRequest notification to peer', { targetPeerDescriptor })
                return
            }, (err) => {
                logger.debug('Failed to send WebsocketConnectionRequest notification to peer ', {
                    error: err, targetPeerDescriptor
                })
            })
        })
        const managedConnection = new ManagedConnection(
            this.localPeerDescriptor!,
            ConnectionType.WEBSOCKET_SERVER,
            undefined,
            undefined,
            targetPeerDescriptor
        )
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(nodeId))
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(nodeId, managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeRequest(
        sourcePeerDescriptor: PeerDescriptor,
        serverWebsocket: IConnection,
        sourceVersion: string,
        targetPeerDescriptor?: PeerDescriptor
    ) {
        const nodeId = getNodeIdFromPeerDescriptor(sourcePeerDescriptor)
        if (this.ongoingConnectRequests.has(nodeId)) {
            const ongoingConnectRequest = this.ongoingConnectRequests.get(nodeId)!
            if (!isCompatibleVersion(sourceVersion, version)) {
                ongoingConnectRequest.rejectHandshake(HandshakeError.UNSUPPORTED_VERSION)
            } else {
                ongoingConnectRequest.attachImplementation(serverWebsocket)
                ongoingConnectRequest.acceptHandshake()
            }
            this.ongoingConnectRequests.delete(nodeId)
        } else {
            const managedConnection = new ManagedConnection(
                this.localPeerDescriptor!,
                ConnectionType.WEBSOCKET_SERVER,
                undefined,
                serverWebsocket,
                targetPeerDescriptor
            )
            managedConnection.setRemotePeerDescriptor(sourcePeerDescriptor)
            if (!isCompatibleVersion(sourceVersion, version)) {
                managedConnection.rejectHandshake(HandshakeError.UNSUPPORTED_VERSION)
            } else if (targetPeerDescriptor && !areEqualPeerDescriptors(this.localPeerDescriptor!, targetPeerDescriptor)) {
                managedConnection.rejectHandshake(HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR)
            } else if (this.config.onNewConnection(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake(HandshakeError.DUPLICATE_CONNECTION)
            }
        }
    }

    public setLocalPeerDescriptor(localPeerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = localPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.abortController.abort()
        this.rpcCommunicator.destroy()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close(false)))

        const attempts = Array.from(this.connectingConnections.values())
        await Promise.allSettled(attempts.map((conn) => conn.close(false)))
        await this.websocketServer?.stop()
    }
}
