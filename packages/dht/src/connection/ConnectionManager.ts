import EventEmitter from 'events'
import {
    ConnectivityRequestMessage,
    ConnectivityResponseMessage,
    HandshakeMessage,
    Message,
    MessageType,
    PeerDescriptor
} from '../proto/DhtRpc'
import { ConnectionType, Event as ConnectionEvents, IConnection } from './IConnection'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { WebSocketServer } from './WebSocket/WebSocketServer'
import { ServerWebSocket } from './WebSocket/ServerWebSocket'
import { PeerID } from '../PeerID'
import { Event, ITransport } from '../transport/ITransport'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { WebRtcConnector } from './WebRTC/WebRtcConnector'

export interface ConnectionManagerConfig {
    webSocketHost?: string,
    webSocketPort?: number,
    entryPoints?: PeerDescriptor[]
}

const DEFAULT_DISCONNECTION_TIMEOUT = 10000

export class ConnectionManager extends EventEmitter implements ITransport {
    public PROTOCOL_VERSION = '1.0'

    private ownPeerDescriptor: PeerDescriptor | null = null
    private connections: { [peerId: string]: IConnection } = {}

    private disconnectionTimeouts: { [peerId: string]: NodeJS.Timeout } = {}
    private webSocketConnector: WebSocketConnector | null
    private webrtcConnector: WebRtcConnector | null

    private webSocketServer: WebSocketServer | null

    constructor(private config: ConnectionManagerConfig) {
        super()
        if (config.webSocketPort) {
            this.webSocketServer = new WebSocketServer()
        } else {
            this.webSocketServer = null
        }
        this.webSocketConnector = null
        this.webrtcConnector = null
    }

    private async handleIncomingConnectivityRequest(connection: IConnection, connectivityRequest: ConnectivityRequestMessage) {
        let outgoingConnection: IConnection | null = null
        let connectivityResponseMessage: ConnectivityResponseMessage | null = null
        try {
            outgoingConnection = await this.webSocketConnector!.connectAsync({
                host: (connection as ServerWebSocket).remoteAddress,
                port: connectivityRequest.port, timeoutMs: 1000
            })
        }
        catch (e) {
            console.log("Connectivity test produced negative result, communicating reply to the requester")
            console.log(e)

            connectivityResponseMessage = {
                openInternet: false,
                ip: (connection as ServerWebSocket).remoteAddress,
                natType: 'unknown'
            }
        }

        if (outgoingConnection) {
            outgoingConnection.close()

            // console.log("Connectivity test produced positive result, communicating reply to the requester")

            connectivityResponseMessage = {
                openInternet: true,
                ip: (connection as ServerWebSocket).remoteAddress,
                natType: 'open_internet',
                websocket: { ip: (connection as ServerWebSocket).remoteAddress, port: connectivityRequest.port }
            }
        }

        const msg: Message = {
            messageType: MessageType.CONNECTIVITY_RESPONSE, messageId: '1234',
            body: ConnectivityResponseMessage.toBinary(connectivityResponseMessage!)
        }
        connection.send(Message.toBinary(msg))
    }

    private async sendConnectivityRequest(): Promise<ConnectivityResponseMessage> {
        return new Promise(async (resolve, reject) => {
            const entryPoint = this.config.entryPoints![0]

            let outgoingConnection: IConnection | null = null

            try {
                outgoingConnection = await this.webSocketConnector!.connectAsync({
                    host: entryPoint.websocket?.ip, port: entryPoint.websocket?.port, timeoutMs: 1000
                })
            }
            catch (e) {
                //console.log("Failed to connect to the entrypoints")

                reject(new Error('Failed to connect to the entrypoints'))
            }

            if (outgoingConnection) {

                // prepare for receiving a connectivity reply
                outgoingConnection.once(ConnectionEvents.DATA, (bytes) => {
                    const message: Message = Message.fromBinary(bytes)
                    const connectivityResponseMessage = ConnectivityResponseMessage.fromBinary(message.body)

                    resolve(connectivityResponseMessage)
                })

                // send connectivity request
                const connectivityRequestMessage: ConnectivityRequestMessage = { port: this.config.webSocketPort! }
                const msg: Message = {
                    messageType: MessageType.CONNECTIVITY_REQUEST, messageId: 'xyz',
                    body: ConnectivityRequestMessage.toBinary(connectivityRequestMessage)
                }

                outgoingConnection.once(ConnectionEvents.ERROR, () => {
                    console.log('clientsocket error')
                })

                // console.log('trying to send connectivity request')
                outgoingConnection.send(Message.toBinary(msg))
                // console.log('connectivity request sent: ' + JSON.stringify(Message.toJson(msg)))
            }
        })
    }

    async start(): Promise<ConnectivityResponseMessage> {

        // Set up and start websocket server
        if (this.webSocketServer) {
            this.webSocketServer.bindListeners(
                this.handleIncomingConnectivityRequest.bind(this),
                this.onIncomingMessage.bind(this)
            )

            await this.webSocketServer.start({ host: this.config.webSocketHost, port: this.config.webSocketPort })

            return new Promise(async (resolve, reject) => {
                // Open webscoket connection to one of the entrypoints and send a CONNECTIVITY_REQUEST message

                if (this.config.entryPoints && this.config.entryPoints.length > 0) {
                    this.sendConnectivityRequest().then((response) => { resolve(response) }).catch((err) => reject(err))
                }

                else {
                    // return connectivity info given in config to be used for id generation

                    const connectivityResponseMessage: ConnectivityResponseMessage = {
                        openInternet: true,
                        ip: this.config.webSocketHost!,
                        natType: 'open_internet',
                        websocket: { ip: this.config.webSocketHost!, port: this.config.webSocketPort! }
                    }
                    resolve(connectivityResponseMessage)
                }
            })
        }
        const connectivityResponseMessage: ConnectivityResponseMessage = {
            openInternet: false,
            ip: 'localhost',
            natType: 'unknown'
        }
        return new Promise((resolve, _reject) => {
            resolve(connectivityResponseMessage)
        })
    }

    enableConnectivity(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
        if (this.webSocketServer) {
            this.webSocketServer.setOwnPeerDescriptor(ownPeerDescriptor)
        }
        if (this.webrtcConnector) {
            this.webrtcConnector.setOwnPeerDescriptor(ownPeerDescriptor)
            this.webrtcConnector.bindListeners(this.onIncomingMessage.bind(this), this.PROTOCOL_VERSION)
        }

        this.webSocketConnector!.bindListeners(this.onIncomingMessage.bind(this), this.PROTOCOL_VERSION)
    }

    onIncomingMessage = (connection: IConnection, message: Message): void => {
        if (message.messageType === MessageType.HANDSHAKE && this.ownPeerDescriptor) {
            const handshake = HandshakeMessage.fromBinary(message.body)
            const stringId = PeerID.fromValue(handshake.sourceId).toString()
            connection.setPeerDescriptor(handshake.peerDescriptor as PeerDescriptor)
            if (!this.connections.hasOwnProperty(stringId)
                || (this.connections[stringId] && this.connections[stringId].connectionType === ConnectionType.DEFERRED)) {
                let oldConnection
                if ((this.connections[stringId] && this.connections[stringId].connectionType === ConnectionType.DEFERRED)) {
                    oldConnection = this.connections[stringId]
                }
                this.connections[stringId] = connection

                const outgoingHandshake: HandshakeMessage = {
                    sourceId: this.ownPeerDescriptor.peerId,
                    protocolVersion: this.PROTOCOL_VERSION,
                    peerDescriptor: this.ownPeerDescriptor
                }
                const msg: Message = {
                    messageType: MessageType.HANDSHAKE, 
                    messageId: 'xyz',
                    body: HandshakeMessage.toBinary(outgoingHandshake)
                }
                connection.send(Message.toBinary(msg))
                if (oldConnection) {
                    oldConnection.getBufferedMessages().forEach((msg) => {
                        connection.send(msg)
                    })
                    oldConnection.close()
                }
            }
        }
        else {
            this.emit(Event.DATA, connection.getPeerDescriptor(), message)
        }
    }

    async stop(): Promise<void> {
        Object.values(this.connections).map((connection) => {
            connection.close()
        })
        this.removeAllListeners()
        if (this.webSocketServer) {
            await this.webSocketServer.stop()
        }
        Object.values(this.disconnectionTimeouts).map(async (timeout) => {
            clearTimeout(timeout)
        })
        this.disconnectionTimeouts = {}
        if (this.webSocketConnector) {
            this.webSocketConnector!.stop()
        }
        if (this.webSocketConnector) {
            this.webSocketConnector!.stop()
        }
    }

    // ToDo: This method needs some thought, establishing the connection might take tens of seconds,
    // or it might fail completely! Where should we buffer the outgoing data?

    async send(peerDescriptor: PeerDescriptor, message: Message): Promise<void> {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()

        if (this.connections.hasOwnProperty(stringId)) {
            this.connections[stringId].send(Message.toBinary(message))
        }

        else if (peerDescriptor.websocket) {
            const connection = this.webSocketConnector!.connect({
                host: peerDescriptor.websocket.ip,
                port: peerDescriptor.websocket.port
            })
            connection.setPeerDescriptor(peerDescriptor)
            this.connections[stringId] = connection
            connection.send(Message.toBinary(message))
        }

        else if (this.ownPeerDescriptor!.websocket && !peerDescriptor.websocket) {
            const connection = this.webSocketConnector!.connect({
                ownPeerDescriptor: this.ownPeerDescriptor!,
                targetPeerDescriptor: peerDescriptor
            })
            this.connections[stringId] = connection
            connection.send(Message.toBinary(message))
        }

        else if (this.webrtcConnector) {
            const connection = this.webrtcConnector.connect(peerDescriptor)
            this.connections[stringId] = connection
            connection.send(Message.toBinary(message))
        }
    }

    disconnect(peerDescriptor: PeerDescriptor, reason?: string, timeout = DEFAULT_DISCONNECTION_TIMEOUT): void {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()
        this.disconnectionTimeouts[stringId] = setTimeout(() => {
            this.closeConnection(stringId, reason)
        }, timeout)
    }

    private closeConnection(stringId: string, reason?: string): void {
        if (this.connections.hasOwnProperty(stringId)) {
            console.log(`Disconnecting from Peer ${stringId}${reason ? `: ${reason}` : ''}`)
            this.connections[stringId].close()
        }
    }

    getConnection(peerDescriptor: PeerDescriptor): IConnection | null {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()
        return this.connections[stringId] || null
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    hasConnection(peerDescriptor: PeerDescriptor): boolean {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()
        return !!this.connections[stringId]
    }

    canConnect(peerDescriptor: PeerDescriptor, _ip: string, port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) && this.webSocketConnector!.withinPortRange(port)
    }

    addConnection(peerDescriptor: PeerDescriptor, connection: IConnection, replaceDeferred = true): void {
        if (!this.hasConnection(peerDescriptor)
            || (replaceDeferred
                && this.hasConnection(peerDescriptor)
                && this.getConnection(peerDescriptor)!.connectionType === ConnectionType.DEFERRED)
        ) {

            this.connections[PeerID.fromValue(peerDescriptor.peerId).toString()] = connection
        }
    }

    createWsConnector(transport: ITransport, rpcCommunicator?: RpcCommunicator): void {
        this.webSocketConnector = new WebSocketConnector(transport, this.canConnect.bind(this), rpcCommunicator)
    }

    createWebRtcConnector(transport: ITransport, rpcCommunicator?: RpcCommunicator): void {
        this.webrtcConnector = new WebRtcConnector({
            rpcTransport: transport,
            rpcCommunicator,
            fnCanConnect: () => true,
            fnGetConnection: this.getConnection.bind(this),
            fnAddConnection: this.addConnection.bind(this)
        })
    }
}
