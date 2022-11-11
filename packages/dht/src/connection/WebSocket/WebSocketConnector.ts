import 'setimmediate'
import EventEmitter from 'eventemitter3'
import {
    ManagedConnectionSourceEvent
} from '../IManagedConnectionSource'

import { PeerID } from '../../helpers/PeerID'
import { ClientWebSocket } from './ClientWebSocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    ConnectivityResponseMessage,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/DhtRpc'
import { WebSocketConnectorServiceClient } from '../../proto/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { IWebSocketConnectorService } from '../../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { WebSocketServer } from './WebSocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebSocket } from './ServerWebSocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'

const logger = new Logger(module)

export class WebSocketConnector extends EventEmitter<ManagedConnectionSourceEvent> implements IWebSocketConnectorService {
    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocketconnector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private readonly webSocketServer?: WebSocketServer
    private readonly connectivityChecker: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private ownPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private stopped = false

    constructor(
        private protocolVersion: string,
        private rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean,
        private webSocketPort?: number,
        private webSocketHost?: string,
        private entrypoints?: PeerDescriptor[],
    ) {
        super()

        this.webSocketServer = webSocketPort ? new WebSocketServer() : undefined
        this.connectivityChecker = new ConnectivityChecker(webSocketPort)

        this.canConnectFunction = fnCanConnect.bind(this)

        this.rpcCommunicator = new ListeningRpcCommunicator(WebSocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, this.rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.requestConnection = this.requestConnection.bind(this)

        this.rpcCommunicator.registerRpcMethod(
            WebSocketConnectionRequest,
            WebSocketConnectionResponse,
            'requestConnection',
            this.requestConnection
        )
    }

    public async start(): Promise<void> {
        if (this.webSocketServer) {
            this.webSocketServer.on('connected', (connection: IConnection) => {
                this.connectivityChecker.listenToIncomingConnectivityRequests(connection as unknown as ServerWebSocket)
            })
            await this.webSocketServer.start(this.webSocketPort!, this.webSocketHost)
        }
    }

    public async checkConnectivity(): Promise<ConnectivityResponseMessage> {

        const noServerConnectivityResponse: ConnectivityResponseMessage = {
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

                const preconfiguredConnectivityResponse: ConnectivityResponseMessage = {
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
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.stopped) {
            logger.info('connect called on closed websocketconnector')
        }
        const peerKey = PeerID.fromValue(targetPeerDescriptor.peerId).toKey()
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

            this.connectingConnections.set(PeerID.fromValue(targetPeerDescriptor.peerId).toKey(), managedConnection)

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
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(PeerID.fromValue(targetPeerDescriptor.peerId).toKey()))
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(PeerID.fromValue(targetPeerDescriptor.peerId).toKey(), managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeCompleted = (peerDescriptor: PeerDescriptor,
        serverWebSocket: IConnection, managedConnection: ManagedConnection) => {

        logger.trace('serversocket handshake completed')
        const peerId = PeerID.fromValue(peerDescriptor.peerId)
        if (this.ongoingConnectRequests.has(peerId.toKey())) {
            this.ongoingConnectRequests.get(peerId.toKey())?.attachImplementation(serverWebSocket, peerDescriptor)
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            this.emit('newConnection', managedConnection)
        }
    }
    public setOwnPeerDescriptor(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor

        if (this.webSocketServer) {
            this.webSocketServer.on('connected', (connection: IConnection) => {
                const managedConnection = new ManagedConnection(ownPeerDescriptor, this.protocolVersion,
                    ConnectionType.WEBSOCKET_SERVER, undefined, connection)
                logger.trace('connected, objectId: ' + managedConnection.objectId)
                managedConnection.once('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                    logger.trace('handshake completed objectId: ' + managedConnection.objectId)
                    this.onServerSocketHandshakeCompleted(peerDescriptor, connection, managedConnection)
                })
            })
        }
    }

    public async stop(): Promise<void> {
        this.stopped = true
        this.rpcCommunicator.stop()

        this.ongoingConnectRequests.forEach((managedConnection) => {
            logger.info('closing ongoingConnectRequest')
            managedConnection.close()
        })

        this.connectingConnections.forEach((managedConnection) => {
            logger.info('closing connectingConnection')
            managedConnection.close()
        })

        await this.webSocketServer?.stop()
    }

    // IWebSocketConnectorService implementation
    public async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        if (this.canConnectFunction(request.requester!, request.ip, request.port)) {
            setImmediate(() => {
                const connection = this.connect(request.requester!)
                this.emit('newConnection', connection)
            })
            const res: WebSocketConnectionResponse = {
                accepted: true
            }
            return res
        }
        const res: WebSocketConnectionResponse = {
            accepted: false
        }
        return res
    }
}
