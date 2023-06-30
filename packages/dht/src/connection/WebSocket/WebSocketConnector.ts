import { ClientWebSocket } from './ClientWebSocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    ConnectivityResponse,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebSocketConnectorServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger, wait } from '@streamr/utils'
import { IWebSocketConnectorService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { WebSocketServer } from './WebSocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebSocket } from './ServerWebSocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from '../Handshaker'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ParsedUrlQuery } from 'querystring'

const logger = new Logger(module)

export class WebSocketConnector implements IWebSocketConnectorService {
    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocketconnector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private readonly webSocketServer?: WebSocketServer
    private readonly connectivityChecker: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private incomingConnectionCallback: (connection: ManagedConnection) => boolean
    private webSocketPort?: number
    private webSocketHost?: string
    private entrypoints?: PeerDescriptor[]

    private readonly protocolVersion: string
    private ownPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private stopped = false

    constructor(
        protocolVersion: string,
        rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean,
        webSocketPort?: number,
        webSocketHost?: string,
        entrypoints?: PeerDescriptor[]
    ) {
        this.protocolVersion = protocolVersion
        this.webSocketServer = webSocketPort ? new WebSocketServer() : undefined
        this.connectivityChecker = new ConnectivityChecker(webSocketPort)
        this.incomingConnectionCallback = incomingConnectionCallback
        this.webSocketPort = webSocketPort
        this.webSocketHost = webSocketHost
        this.entrypoints = entrypoints

        this.canConnectFunction = fnCanConnect.bind(this)

        this.rpcCommunicator = new ListeningRpcCommunicator(WebSocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.rpcCommunicator.registerRpcMethod(
            WebSocketConnectionRequest,
            WebSocketConnectionResponse,
            'requestConnection',
            (req: WebSocketConnectionRequest, context) => this.requestConnection(req, context)
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.ownPeerDescriptor!, this.protocolVersion, connection)

        handshaker.once('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(peerDescriptor, connection)
        })
    }

    public async start(): Promise<void> {
        if (this.webSocketServer) {
            this.webSocketServer.on('connected', (connection: IConnection) => {

                const serverSocket = connection as unknown as ServerWebSocket

                logger.debug('resource url: ' + JSON.stringify(serverSocket.resourceURL))
                if (serverSocket.resourceURL &&
                    serverSocket.resourceURL.query) {
                    const query = serverSocket.resourceURL.query as unknown as ParsedUrlQuery
                    if (query.connectivityRequest) {
                        logger.debug("Received connectivity request connection")
                        this.connectivityChecker.listenToIncomingConnectivityRequests(serverSocket)
                    } else if (query.connectivityProbe) {
                        logger.debug("Received connectivity probe connection")
                    } else {
                        this.attachHandshaker(connection)
                    }
                } else {
                    this.attachHandshaker(connection)
                }
            })
            await this.webSocketServer.start(this.webSocketPort!, this.webSocketHost)
        }
    }

    public async checkConnectivity(reattempt = 0): Promise<ConnectivityResponse> {
        try {
            const noServerConnectivityResponse: ConnectivityResponse = {
                openInternet: false,
                ip: '127.0.0.1',
                natType: NatType.UNKNOWN
            }

            if (!this.webSocketServer) {
                // If no websocket server, return openInternet: false
                return noServerConnectivityResponse
            } else {
                if (!this.entrypoints || this.entrypoints.length < 1) {
                    // return connectivity info given in config

                    const preconfiguredConnectivityResponse: ConnectivityResponse = {
                        openInternet: true,
                        ip: this.webSocketHost!,
                        natType: NatType.OPEN_INTERNET,
                        websocket: { ip: this.webSocketHost!, port: this.webSocketPort! }
                    }
                    return preconfiguredConnectivityResponse
                } else {
                    // Do real connectivity checking

                    let response = noServerConnectivityResponse

                    response = await this.connectivityChecker.sendConnectivityRequest(this.entrypoints[0])

                    return response
                }
            }
        } catch (err) {
            if (reattempt < 5) {
                await wait(2000)
                return this.checkConnectivity(reattempt + 1)
            } else {
                throw err
            }
        }

    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.stopped) {
            logger.info('connect called on closed websocketconnector')
        }
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        if (this.ownPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.ownPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebSocket()

            const address = 'ws://' + targetPeerDescriptor.websocket!.ip + ':' +
                targetPeerDescriptor.websocket!.port

            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
            managedConnection.setPeerDescriptor(targetPeerDescriptor!)

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

            socket.connect(address)

            return managedConnection
        }
    }

    public requestConnectionFromPeer(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                toProtoRpcClient(new WebSocketConnectorServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.ip, ownPeerDescriptor.websocket!.port)
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
            ongoingConnectReguest.attachImplementation(serverWebSocket, peerDescriptor)
            ongoingConnectReguest.acceptHandshake()
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_SERVER, undefined, serverWebSocket)

            managedConnection.setPeerDescriptor(peerDescriptor)

            if (this.incomingConnectionCallback(managedConnection)) {
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

    public async stop(): Promise<void> {
        this.stopped = true
        this.rpcCommunicator.stop()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close('OTHER')))

        const attempts = Array.from(this.connectingConnections.values())
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))

        await this.webSocketServer?.stop()
    }

    // IWebSocketConnectorService implementation
    public async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        if (!this.stopped && this.canConnectFunction(request.requester!, request.ip, request.port)) {
            setImmediate(() => {
                const connection = this.connect(request.requester!)
                this.incomingConnectionCallback(connection)
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
