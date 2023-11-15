import { ClientWebsocket } from './ClientWebsocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { WebsocketConnectorRpcLocal } from './WebsocketConnectorRpcLocal'
import { WebsocketConnectorRpcRemote } from './WebsocketConnectorRpcRemote'
import {
    ConnectivityMethod,
    ConnectivityResponse,
    PeerDescriptor,
    WebsocketConnectionRequest,
    WebsocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger, binaryToHex, wait } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { WebsocketServer } from './WebsocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebsocket } from './ServerWebsocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from '../Handshaker'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ParsedUrlQuery } from 'querystring'
import { range, sample } from 'lodash'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { WebsocketServerStartError } from '../../helpers/errors'
import { AutoCertifierClientFacade } from './AutoCertifierClientFacade'
const logger = new Logger(module)

export const connectivityMethodToWebsocketUrl = (ws: ConnectivityMethod): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port
}

const ENTRY_POINT_CONNECTION_ATTEMPTS = 5

export interface WebsocketConnectorConfig {
    transport: ITransport
    canConnect: (peerDescriptor: PeerDescriptor) => boolean
    onIncomingConnection: (connection: ManagedConnection) => boolean
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
    private connectivityChecker?: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private onIncomingConnection: (connection: ManagedConnection) => boolean
    private host?: string
    private readonly entrypoints?: PeerDescriptor[]
    private readonly tlsCertificate?: TlsCertificate
    private readonly autoCertifierTransport: ITransport
    private readonly autoCertifierUrl: string
    private readonly autoCertifierConfigFile: string
    private readonly serverEnableTls: boolean
    private autoCertifierClient?: AutoCertifierClientFacade
    private selectedPort?: number
    private localPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private abortController = new AbortController()

    constructor(config: WebsocketConnectorConfig) {
        this.websocketServer = config.portRange ? new WebsocketServer({
            portRange: config.portRange!,
            tlsCertificate: config.tlsCertificate,
            maxMessageSize: config.maxMessageSize,
            enableTls: config.serverEnableTls
        }) : undefined
        this.onIncomingConnection = config.onIncomingConnection
        this.host = config.host
        this.entrypoints = config.entrypoints
        this.tlsCertificate = config.tlsCertificate
        this.autoCertifierTransport = config.autoCertifierTransport
        this.autoCertifierUrl = config.autoCertifierUrl
        this.autoCertifierConfigFile = config.autoCertifierConfigFile
        this.serverEnableTls = config.serverEnableTls
        this.rpcCommunicator = new ListeningRpcCommunicator(WebsocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000
        })
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: WebsocketConnectorConfig) {
        const rpcLocal = new WebsocketConnectorRpcLocal({
            canConnect: (peerDescriptor: PeerDescriptor) => config.canConnect(peerDescriptor),
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            onIncomingConnection: (connection: ManagedConnection) => config.onIncomingConnection(connection),
            abortSignal: this.abortController.signal
        })
        this.rpcCommunicator.registerRpcMethod(
            WebsocketConnectionRequest,
            WebsocketConnectionResponse,
            'requestConnection',
            async (req: WebsocketConnectionRequest, context: ServerCallContext) => {
                if (!this.abortController.signal.aborted) {
                    return rpcLocal.requestConnection(req, context)
                } else {
                    return { accepted: false }
                }
            }
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.localPeerDescriptor!, connection)
        handshaker.once('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(peerDescriptor, connection)
        })
    }

    public async autoCertify(): Promise<void> {
        this.autoCertifierClient = new AutoCertifierClientFacade({
            configFile: this.autoCertifierConfigFile,
            transport: this.autoCertifierTransport,
            url: this.autoCertifierUrl,
            wsServerPort: this.selectedPort!,
            setHost: (hostName: string) => this.setHost(hostName),
            updateCertificate: (certificate: string, privateKey: string) => this.websocketServer!.updateCertificate(certificate, privateKey)
        })
        logger.trace(`AutoCertifying subdomain...`)
        await this.autoCertifierClient!.start()
    }

    private setHost(hostName: string): void {
        logger.trace(`Setting host name to ${hostName}`)
        this.host = hostName
        this.connectivityChecker!.setHost(hostName)
    }

    public async start(): Promise<void> {
        if (!this.abortController.signal.aborted && this.websocketServer) {
            this.websocketServer.on('connected', (connection: IConnection) => {

                const serverSocket = connection as unknown as ServerWebsocket
                if (serverSocket.resourceURL &&
                    serverSocket.resourceURL.query) {
                    const query = serverSocket.resourceURL.query as unknown as ParsedUrlQuery
                    if (query.connectivityRequest) {
                        logger.trace('Received connectivity request connection from ' + serverSocket.getRemoteAddress())
                        this.connectivityChecker!.listenToIncomingConnectivityRequests(serverSocket)
                    } else if (query.connectivityProbe) {
                        logger.trace('Received connectivity probe connection from ' + serverSocket.getRemoteAddress())
                    } else {
                        this.attachHandshaker(connection)
                    }
                } else {
                    this.attachHandshaker(connection)
                }
            })
            const port = await this.websocketServer.start()
            this.selectedPort = port
            this.connectivityChecker = new ConnectivityChecker(this.selectedPort, this.serverEnableTls, this.host)
        }
    }

    public async checkConnectivity(selfSigned: boolean): Promise<ConnectivityResponse> {
        // TODO: this could throw if the server is not running
        const noServerConnectivityResponse: ConnectivityResponse = {
            host: '127.0.0.1',
            natType: NatType.UNKNOWN
        }
        if (this.abortController.signal.aborted) {
            return noServerConnectivityResponse
        }
        for (const reattempt of range(ENTRY_POINT_CONNECTION_ATTEMPTS)) {
            const entryPoint = sample(this.entrypoints)!
            try {
                if (!this.websocketServer) {
                    return noServerConnectivityResponse
                } else {
                    if (!this.entrypoints || this.entrypoints.length === 0) {
                        // return connectivity info given in config
                        const preconfiguredConnectivityResponse: ConnectivityResponse = {
                            host: this.host!,
                            natType: NatType.OPEN_INTERNET,
                            websocket: { host: this.host!, port: this.selectedPort!, tls: this.tlsCertificate !== undefined }
                        }
                        return preconfiguredConnectivityResponse
                    } else {
                        // Do real connectivity checking     
                        return await this.connectivityChecker!.sendConnectivityRequest(entryPoint, selfSigned)
                    }
                }
            } catch (err) {
                if (reattempt < ENTRY_POINT_CONNECTION_ATTEMPTS) {
                    const error = `Failed to connect to entrypoint with id ${binaryToHex(entryPoint.kademliaId)} `
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
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        if (this.localPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.localPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebsocket()

            const url = connectivityMethodToWebsocketUrl(targetPeerDescriptor.websocket!)

            const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
            managedConnection.setPeerDescriptor(targetPeerDescriptor)

            this.connectingConnections.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)

            const delFunc = () => {
                if (this.connectingConnections.has(peerKey)) {
                    this.connectingConnections.delete(peerKey)
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
                toProtoRpcClient(new WebsocketConnectorRpcClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            remoteConnector.requestConnection(localPeerDescriptor.websocket!.host, localPeerDescriptor.websocket!.port)
        })
        const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_SERVER)
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(keyFromPeerDescriptor(targetPeerDescriptor)))
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeRequest(peerDescriptor: PeerDescriptor, serverWebsocket: IConnection) {

        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        if (this.ongoingConnectRequests.has(peerId.toKey())) {
            const ongoingConnectReguest = this.ongoingConnectRequests.get(peerId.toKey())!
            ongoingConnectReguest.attachImplementation(serverWebsocket)
            ongoingConnectReguest.acceptHandshake()
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_SERVER, undefined, serverWebsocket)

            managedConnection.setPeerDescriptor(peerDescriptor)

            if (this.onIncomingConnection(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
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
        this.connectivityChecker?.destroy()
        await this.websocketServer?.stop()
    }
}
