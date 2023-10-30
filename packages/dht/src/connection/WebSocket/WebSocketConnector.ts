import { ClientWebSocket } from './ClientWebSocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    ConnectivityMethod,
    ConnectivityResponse,
    NodeType,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebSocketConnectorServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger, binaryToHex, wait } from '@streamr/utils'
import { IWebSocketConnectorService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ManagedConnection } from '../ManagedConnection'
import { WebSocketServer } from './WebSocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebSocket } from './ServerWebSocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from '../Handshaker'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ParsedUrlQuery } from 'querystring'
import { range, sample } from 'lodash'
import { isPrivateIPv4 } from '../../helpers/AddressTools'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'

const logger = new Logger(module)

export const connectivityMethodToWebSocketUrl = (ws: ConnectivityMethod): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port
}

const canOpenConnectionFromBrowser = (websocketServer: ConnectivityMethod) => {
    const hasPrivateAddress = ((websocketServer.host === 'localhost') || isPrivateIPv4(websocketServer.host))
    return websocketServer.tls || hasPrivateAddress
}

const ENTRY_POINT_CONNECTION_ATTEMPTS = 5

interface WebSocketConnectorConfig {
    protocolVersion: string
    rpcTransport: ITransport
    canConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    onIncomingConnection: (connection: ManagedConnection) => boolean
    portRange?: PortRange
    maxMessageSize?: number
    host?: string
    entrypoints?: PeerDescriptor[]
    tlsCertificate?: TlsCertificate
}

export class WebSocketConnector implements IWebSocketConnectorService {
    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocket-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private readonly webSocketServer?: WebSocketServer
    private connectivityChecker?: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private onIncomingConnection: (connection: ManagedConnection) => boolean
    private host?: string
    private readonly entrypoints?: PeerDescriptor[]
    private readonly tlsCertificate?: TlsCertificate
    private selectedPort?: number
    private readonly protocolVersion: string
    private ownPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private destroyed = false

    constructor(config: WebSocketConnectorConfig) {
        this.protocolVersion = config.protocolVersion
        this.webSocketServer = config.portRange ? new WebSocketServer({
            portRange: config.portRange!,
            tlsCertificate: config.tlsCertificate,
            maxMessageSize: config.maxMessageSize
        }) : undefined
        this.onIncomingConnection = config.onIncomingConnection
        this.host = config.host
        this.entrypoints = config.entrypoints
        this.tlsCertificate = config.tlsCertificate

        this.canConnectFunction = config.canConnect.bind(this)

        this.rpcCommunicator = new ListeningRpcCommunicator(WebSocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, config.rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.rpcCommunicator.registerRpcMethod(
            WebSocketConnectionRequest,
            WebSocketConnectionResponse,
            'requestConnection',
            (req: WebSocketConnectionRequest, context: ServerCallContext) => this.requestConnection(req, context)
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.ownPeerDescriptor!, this.protocolVersion, connection)
        handshaker.once('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(peerDescriptor, connection)
        })
    }

    public async start(): Promise<void> {
        if (!this.destroyed && this.webSocketServer) {
            this.webSocketServer.on('connected', (connection: IConnection) => {

                const serverSocket = connection as unknown as ServerWebSocket
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
            const port = await this.webSocketServer.start()
            this.selectedPort = port
            this.connectivityChecker = new ConnectivityChecker(this.selectedPort, this.tlsCertificate !== undefined, this.host)
        }
    }

    public async checkConnectivity(): Promise<ConnectivityResponse> {
        // TODO: this could throw if the server is not running
        const noServerConnectivityResponse: ConnectivityResponse = {
            openInternet: false,
            host: '127.0.0.1',
            natType: NatType.UNKNOWN
        }
        if (this.destroyed) {
            return noServerConnectivityResponse
        }
        for (const reattempt of range(ENTRY_POINT_CONNECTION_ATTEMPTS)) {
            const entryPoint = sample(this.entrypoints)!
            try {
                if (!this.webSocketServer) {
                    // If no websocket server, return openInternet: false
                    return noServerConnectivityResponse
                } else {
                    if (!this.entrypoints || this.entrypoints.length < 1) {
                        // return connectivity info given in config
                        const preconfiguredConnectivityResponse: ConnectivityResponse = {
                            openInternet: true,
                            host: this.host!,
                            natType: NatType.OPEN_INTERNET,
                            websocket: { host: this.host!, port: this.selectedPort!, tls: this.tlsCertificate !== undefined }
                        }
                        return preconfiguredConnectivityResponse
                    } else {
                        // Do real connectivity checking     
                        return await this.connectivityChecker!.sendConnectivityRequest(entryPoint)
                    }
                }
            } catch (err) {
                if (reattempt < ENTRY_POINT_CONNECTION_ATTEMPTS) {
                    const error = `Failed to connect to entrypoint with id ${binaryToHex(entryPoint.kademliaId)} ` 
                        + `and URL ${connectivityMethodToWebSocketUrl(entryPoint.websocket!)}`
                    logger.error(error, { error: err })
                    await wait(2000)
                }
            }
        }
        throw Error(`Failed to connect to the entrypoints after ${ENTRY_POINT_CONNECTION_ATTEMPTS} attempts`)
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        if (this.ownPeerDescriptor!.websocket !== undefined) {
            return (targetPeerDescriptor.type !== NodeType.BROWSER) || canOpenConnectionFromBrowser(this.ownPeerDescriptor!.websocket)
        } else if (targetPeerDescriptor.websocket !== undefined) {
            return (this.ownPeerDescriptor!.type !== NodeType.BROWSER) || canOpenConnectionFromBrowser(targetPeerDescriptor.websocket)
        } else {
            return false
        }
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        if (this.ownPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.ownPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebSocket()

            const url = connectivityMethodToWebSocketUrl(targetPeerDescriptor.websocket!)

            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
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

    private requestConnectionFromPeer(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                toProtoRpcClient(new WebSocketConnectorServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.host, ownPeerDescriptor.websocket!.port)
        })
        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion, ConnectionType.WEBSOCKET_SERVER)
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(keyFromPeerDescriptor(targetPeerDescriptor)))
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeRequest = (peerDescriptor: PeerDescriptor, serverWebSocket: IConnection) => {

        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        if (this.ongoingConnectRequests.has(peerId.toKey())) {
            const ongoingConnectReguest = this.ongoingConnectRequests.get(peerId.toKey())!
            ongoingConnectReguest.attachImplementation(serverWebSocket)
            ongoingConnectReguest.acceptHandshake()
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_SERVER, undefined, serverWebSocket)

            managedConnection.setPeerDescriptor(peerDescriptor)

            if (this.onIncomingConnection(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
            }
        }
    }

    public setOwnPeerDescriptor(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.destroyed = true
        this.rpcCommunicator.stop()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close('OTHER')))

        const attempts = Array.from(this.connectingConnections.values())
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))
        this.connectivityChecker?.destroy()
        await this.webSocketServer?.stop()
    }

    // IWebSocketConnectorService implementation
    public async requestConnection(request: WebSocketConnectionRequest, context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (!this.destroyed && this.canConnectFunction(senderPeerDescriptor, request.ip, request.port)) {
            setImmediate(() => {
                if (this.destroyed) {
                    return
                }
                const connection = this.connect(senderPeerDescriptor)
                this.onIncomingConnection(connection)
            })
            const res: WebSocketConnectionResponse = {
                accepted: true
            }
            return res
        }
        return {
            accepted: false
        }
    }
}
