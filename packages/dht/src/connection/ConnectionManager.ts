import EventEmitter from 'events'
import { ConnectivityRequestMessage, ConnectivityResponseMessage, HandshakeMessage, Message, MessageType, PeerDescriptor } from '../proto/DhtRpc'
import { Connection } from './Connection'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { WebSocketServer } from './WebSocket/WebSocketServer'
import { Event as ConnectionSourceEvents } from './IConnectionSource'
import { Event as ConnectionEvents } from './Connection'
import { ServerWebSocket } from './WebSocket/ServerWebSocket'
import { PeerID } from '../PeerID'
import { ITransport, Event } from '../transport/ITransport'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { createRemoteWebSocketConnectorServer } from './WebSocket/RemoteWebSocketConnector'

export interface ConnectionManagerConfig {
    webSocketHost?: string,
    webSocketPort: number,
    entryPoints?: PeerDescriptor[]
}

const DEFAULT_DISCONNECTION_TIMEOUT = 10000

export class ConnectionManager extends EventEmitter implements ITransport {
    public PROTOCOL_VERSION = '1.0'

    private ownPeerDescriptor: PeerDescriptor | null = null
    private connections: { [peerId: string]: Connection } = {}

    private disconnectionTimeouts: { [peerId: string]: NodeJS.Timeout } = {}
    private webSocketConnector: WebSocketConnector = new WebSocketConnector()
    private webSocketServer: WebSocketServer = new WebSocketServer()
    private wsRpcCommunicator: RpcCommunicator | null

    constructor(private config: ConnectionManagerConfig) {
        super()
        this.wsRpcCommunicator = null
    }

    private async handleIncomingConnectivityRequest(connection: Connection, connectivityRequest: ConnectivityRequestMessage) {
        let outgoingConnection: Connection | null = null
        let connectivityResponseMessage: ConnectivityResponseMessage | null = null
        try {
            outgoingConnection = await this.webSocketConnector.connectAsync({
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

            console.log("Connectivity test produced positive result, communicating reply to the requester")

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

            let outgoingConnection: Connection | null = null

            try {
                outgoingConnection = await this.webSocketConnector.connectAsync({
                    host: entryPoint.websocket?.ip, port: entryPoint.websocket?.port, timeoutMs: 1000
                })
            }
            catch (e) {
                //console.log("Failed to connect to the entrypoints")

                reject(new Error('Failed to connect to the entrypoints'))
            }

            if (outgoingConnection) {

                // prepare for receiving a ronnectivity reply
                outgoingConnection.once(ConnectionEvents.DATA, (bytes) => {
                    const message: Message = Message.fromBinary(bytes)
                    const connectivityResponseMessage = ConnectivityResponseMessage.fromBinary(message.body)

                    resolve(connectivityResponseMessage)
                })

                // send connectivity request
                const connectivityRequestMessage: ConnectivityRequestMessage = { port: this.config.webSocketPort }
                const msg: Message = {
                    messageType: MessageType.CONNECTIVITY_REQUEST, messageId: 'xyz',
                    body: ConnectivityRequestMessage.toBinary(connectivityRequestMessage)
                }

                outgoingConnection.once(ConnectionEvents.ERROR, () => {
                    console.log('clientsocket error')
                })

                console.log('trying to send connectivity request')
                outgoingConnection.send(Message.toBinary(msg))
                console.log('connectivity request sent: ' + JSON.stringify(Message.toJson(msg)))
            }
        })
    }

    async start(): Promise<ConnectivityResponseMessage> {

        // Set up and start websocket server

        this.webSocketServer.on(ConnectionSourceEvents.CONNECTED, (connection: Connection) => {

            //this.newConnections[connection.connectionId.toString()] = connection
            console.log('server received new connection')

            connection.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
                console.log('server received data')
                const message = Message.fromBinary(data)

                if (message.messageType === MessageType.CONNECTIVITY_REQUEST) {
                    console.log('received connectivity request')
                    this.handleIncomingConnectivityRequest(connection, ConnectivityRequestMessage.fromBinary(message.body))
                }

                else if (this.ownPeerDescriptor) {
                    this.onIncomingMessage(connection, message)
                }
            })
        })

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
                    websocket: { ip: this.config.webSocketHost!, port: this.config.webSocketPort }
                }
                resolve(connectivityResponseMessage)
            }
        })
    }

    enableConnectivity(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor

        // set up normal listeners that send a handshake for new connections from webSocketConnector
        this.webSocketConnector.on(ConnectionSourceEvents.CONNECTED, (connection: Connection) => {

            connection.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
                const message = Message.fromBinary(data)
                if (this.ownPeerDescriptor) {
                    this.onIncomingMessage(connection, message)
                }
            })

            if (this.ownPeerDescriptor) {
                const outgoingHandshake: HandshakeMessage = {
                    sourceId: this.ownPeerDescriptor.peerId,
                    protocolVersion: this.PROTOCOL_VERSION,
                    peerDescriptor: this.ownPeerDescriptor
                }

                const msg: Message = {
                    messageType: MessageType.HANDSHAKE, messageId: 'xyz',
                    body: HandshakeMessage.toBinary(outgoingHandshake)
                }

                connection.send(Message.toBinary(msg))
                connection.sendBufferedMessages()
            }
        })
    }

    onIncomingMessage = (connection: Connection, message: Message): void => {
        if (message.messageType === MessageType.HANDSHAKE && this.ownPeerDescriptor) {
            const handshake = HandshakeMessage.fromBinary(message.body)

            connection.setPeerDescriptor(handshake.peerDescriptor as PeerDescriptor)

            if (!this.connections.hasOwnProperty(PeerID.fromValue(handshake.sourceId).toString())) {
                
                this.connections[PeerID.fromValue(handshake.sourceId).toString()] = connection

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
            }
        }
        else {
            this.emit(Event.DATA, connection.peerDescriptor, message)
        }
    }

    async stop(): Promise<void> {
        this.removeAllListeners()
        await this.webSocketServer.stop()
        Object.values(this.disconnectionTimeouts).map(async (timeout) => {
            clearTimeout(timeout)
        })
        this.disconnectionTimeouts = {}
    }

    // ToDo: This method needs some thought, establishing the connection might take tens of seconds,
    // or it might fail completely! Where should we buffer the outgoing data?

    send(peerDescriptor: PeerDescriptor, message: Message): void {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()
        if (this.connections.hasOwnProperty(stringId)) {
            this.connections[stringId].send(Message.toBinary(message))
        }

        else if (peerDescriptor.websocket) {
            const connection = this.webSocketConnector.connect({ host: peerDescriptor.websocket.ip, port: peerDescriptor.websocket.port })
            connection.setPeerDescriptor(peerDescriptor)
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

    getConnection(peerDescriptor: PeerDescriptor): Connection | null {
        const stringId = PeerID.fromValue(peerDescriptor.peerId).toString()
        return this.connections[stringId] || null
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    hasConnection(peerDescriptor: PeerDescriptor): boolean {
        return !!this.connections[peerDescriptor.peerId.toString()]
    }

    canConnect(peerDescriptor: PeerDescriptor, _ip: string, port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) && this.webSocketConnector.withinPortRange(port)
    }

    createConnectorRpcs(transport: ITransport): void {
        this.wsRpcCommunicator = new RpcCommunicator({
            appId: "websocket",
            connectionLayer: transport
        })
        const methods = createRemoteWebSocketConnectorServer(this.webSocketConnector.connectAsync, this.canConnect.bind(this))
        this.wsRpcCommunicator.registerServerMethod('requestConnection', methods.requestConnection)
    }
}
