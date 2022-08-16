import 'setimmediate'
import { EventEmitter } from 'events'
import {
    IManagedConnectionSource,
    Event as ManagedConnectionSourceEvent,
} from '../IManagedConnectionSource'

import {
    Event as ConnectionSourceEvent,
} from '../IConnectionSource'
import { PeerID } from '../../helpers/PeerID'
import { ClientWebSocket } from './ClientWebSocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    ConnectivityResponseMessage,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/DhtRpc'
import { WebSocketConnectorClient } from '../../proto/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { IWebSocketConnector } from '../../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { Event as ManagedConnectionEvents } from '../IManagedConnection'
import { WebSocketServer } from './WebSocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebSocket } from './ServerWebSocket'

const logger = new Logger(module)

export class WebSocketConnector extends EventEmitter implements IManagedConnectionSource, IWebSocketConnector {
    private static WEBSOCKET_CONNECTOR_SERVICE_ID = 'websocketconnector'
    private rpcCommunicator: RoutingRpcCommunicator
    private ownPeerDescriptor?: PeerDescriptor
    private canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private webSocketServer?: WebSocketServer
    private connectivityChecker: ConnectivityChecker
    private ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()

    constructor(
        private rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean,
        private webSocketPort?: number,
        private webSocketHost?: string,
        private entrypoints?: PeerDescriptor[],
        private stopped = false
    ) {
        super()

        this.webSocketServer = webSocketPort ? new WebSocketServer() : undefined
        this.connectivityChecker = new ConnectivityChecker(webSocketPort)

        this.canConnectFunction = fnCanConnect.bind(this)

        this.rpcCommunicator = new RoutingRpcCommunicator(WebSocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, this.rpcTransport, {
            rpcRequestTimeout: 10000
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
            this.webSocketServer.on(ConnectionSourceEvent.CONNECTED, (connection: IConnection) => {
                this.connectivityChecker.listenToIncomingConnectivityRequests(connection as unknown as ServerWebSocket)
            })
            await this.webSocketServer.start(this.webSocketPort!, this.webSocketHost)
        }
    }

    public async checkConnectivity(): Promise<ConnectivityResponseMessage> {

        if (!this.webSocketServer) {
            // If no websocket server, return openInternet: false 
            const noServerConnectivityResponse: ConnectivityResponseMessage = {
                openInternet: false,
                ip: 'localhost',
                natType: NatType.UNKNOWN
            }
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

                return this.connectivityChecker.sendConnectivityRequest(this.entrypoints[0])
            }
        }
    }

    public connect({ host, port, url, ownPeerDescriptor, targetPeerDescriptor }: {
        host?: string
        port?: number
        url?: string
        ownPeerDescriptor?: PeerDescriptor
        targetPeerDescriptor?: PeerDescriptor
    } = {}
    ): ManagedConnection {

        if (!host && !port && !url && ownPeerDescriptor && targetPeerDescriptor) {
            return this.requestConnectionFromPeer(ownPeerDescriptor, targetPeerDescriptor)
        }
        const socket = new ClientWebSocket()

        let address = ''
        if (url) {
            address = url
        } else if (host && port) {
            address = 'ws://' + host + ':' + port
        }

        const managedConnection = new ManagedConnection(ownPeerDescriptor!, 'TODO', ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
        managedConnection.setPeerDescriptor(targetPeerDescriptor!)
        socket.connect(address)

        return managedConnection
    }

    public requestConnectionFromPeer(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                new WebSocketConnectorClient(this.rpcCommunicator.getRpcClientTransport())
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.ip, ownPeerDescriptor.websocket!.port)
        })
        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, 'TODO', ConnectionType.WEBSOCKET_SERVER)
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(PeerID.fromValue(targetPeerDescriptor.peerId).toMapKey(), managedConnection)
        return managedConnection
    }

    public setOwnPeerDescriptor(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor

        if (this.webSocketServer) {
            let onHandshakeCompleted = (peerDescriptor: PeerDescriptor, serverWebSocket: IConnection, managedConnection: ManagedConnection) => {
                logger.trace('!!this: ' + this)
                const peerId = PeerID.fromValue(peerDescriptor.peerId)
                if (this.ongoingConnectRequests.has(peerId.toMapKey())) {
                    this.ongoingConnectRequests.get(peerId.toMapKey())?.attachImplementation(serverWebSocket, peerDescriptor)
                    this.ongoingConnectRequests.delete(peerId.toMapKey())
                } else {
                    this.emit(ManagedConnectionSourceEvent.CONNECTED, managedConnection)
                }
            }

            onHandshakeCompleted = onHandshakeCompleted.bind(this)

            this.webSocketServer.on(ConnectionSourceEvent.CONNECTED, (connection: IConnection) => {
                const managedConnection = new ManagedConnection(ownPeerDescriptor, 'TODO', ConnectionType.WEBSOCKET_SERVER, undefined, connection)
                managedConnection.once(ManagedConnectionEvents.HANDSHAKE_COMPLETED, (peerDescriptor: PeerDescriptor) => {

                    onHandshakeCompleted(peerDescriptor, connection, managedConnection)
                })
            })
        }
    }

    public async stop(): Promise<void> {
        this.stopped = true
        this.rpcCommunicator.stop()
        await this.webSocketServer?.stop()
    }

    // IWebSocketConnector implementation
    public async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        if (this.canConnectFunction(request.requester!, request.ip, request.port)) {
            setImmediate(() => {
                const connection = this.connect({
                    host: request.ip, port: request.port,
                    targetPeerDescriptor: request.requester, ownPeerDescriptor: this.ownPeerDescriptor
                })
                this.emit(ManagedConnectionSourceEvent.CONNECTED, connection)
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
