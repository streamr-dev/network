import EventEmitter from 'events'
import { IConnectionManager } from './IConnectionManager'
import { ConnectivityRequestMessage, ConnectivityResponseMessage, HandshakeMessage, Message, MessageType, PeerDescriptor } from '../proto/DhtRpc'
import { Connection } from './Connection'
import { WebSocketConnector } from './WebSocketConnector'
import { WebSocketServer } from './WebSocketServer'
import { Event as ConnectionSourceEvents } from './ConnectionSource'
import { Event as ConnectionEvents } from './Connection'
import { ServerWebSocket } from './ServerWebSocket'

export interface ConnectionManagerConfig {
    webSocketHost?: string,
    webSocketPort: number,
    entryPoints?: PeerDescriptor[]
}

export class ConnectionManager extends EventEmitter implements IConnectionManager {

    private connections: { [peerId: string]: Connection } = {}
    //private newConnections: { [connectionId: string]: Connection } = {}

    private webSocketConnector: WebSocketConnector = new WebSocketConnector()
    private webSocketServer: WebSocketServer = new WebSocketServer()

    constructor(private config: ConnectionManagerConfig) {
        super()
    }

    async start(): Promise<ConnectivityResponseMessage> {

        // Set up and start websocket server

        this.webSocketServer.on(ConnectionSourceEvents.NEW_CONNECTION, (connection: Connection) => {
             
            //this.newConnections[connection.connectionId.toString()] = connection
            console.log('server received new connection') 
            connection.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
                console.log('server received data')
                const message = Message.fromBinary(data)
                if (message.messageType === MessageType.CONNECTIVITY_REQUEST) {
                    console.log('received connectivity request')
                    const connectivityRequest = ConnectivityRequestMessage.fromBinary(data)

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
                            natType: 'open_internet'
                        }
                    }

                    const msg: Message = {
                        messageType: MessageType.CONNECTIVITY_RESPONSE, messageId: '1234',
                        body: ConnectivityResponseMessage.toBinary(connectivityResponseMessage!)
                    }
                    connection.send(Message.toBinary(msg))
                }

                if (message.messageType === MessageType.HANDSHAKE) {
                    const handshake = HandshakeMessage.fromBinary(message.body)
                    this.connections[handshake.sourceId] = connection
                    const outgoingHandshake = HandshakeMessage.create()
                    //outgoingHandshake.sourceId = this.ownId.toString()
                    connection.send(HandshakeMessage.toBinary(outgoingHandshake))
                }
            })
        })

        await this.webSocketServer.start({ host: this.config.webSocketHost, port: this.config.webSocketPort })

        return new Promise(async (resolve, reject) => {
            // Open webscoket connection to one of the entrypoints and send a CONNECTIVITY_REQUEST message

            if (this.config.entryPoints && this.config.entryPoints.length > 0) {
                const entryPoint = this.config.entryPoints[0]

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
                    const msg: Message = { messageType: MessageType.CONNECTIVITY_REQUEST, messageId: 'xyz', 
                        body: ConnectivityRequestMessage.toBinary(connectivityRequestMessage) }
                    
                    outgoingConnection.once(ConnectionEvents.ERROR, ()=> {
                        console.log('clientsocket error')
                    })

                    console.log('trying to send connectivity request')
                    outgoingConnection.send(Message.toBinary(msg))
                    console.log('connectivity request sent: ' + JSON.stringify(Message.toJson(msg)) )
                    
                    // set up normal listeners that send a handshake for new connections from webSocketConnector

                    this.webSocketConnector.on(ConnectionSourceEvents.NEW_CONNECTION, (connection: Connection) => {
                        //this.newConnections[connection.connectionId.toString()] = connection
                        connection.on(ConnectionEvents.DATA, (data: Uint8Array) => {
                            const handshake = HandshakeMessage.fromBinary(data)
                            this.connections[handshake.sourceId] = connection
                        })
                        const outgoingHandshake = HandshakeMessage.create()
                        //outgoingHandshake.sourceId = this.ownId.toString()

                        connection.send(HandshakeMessage.toBinary(outgoingHandshake))
                    })
                }
            }

            else {
                // return connectivity info given in config to be used for id generation

                const connectivityResponseMessage: ConnectivityResponseMessage = {
                    openInternet: true,
                    ip: this.config.webSocketHost!,
                    natType: 'open_internet'
                }
                resolve(connectivityResponseMessage)
            }
        })
    }

    async stop(): Promise<void> {
        await this.webSocketServer.stop()
    }

    send(peerDescriptor: PeerDescriptor, bytes: Uint8Array): void {
        if (peerDescriptor.websocket) {
            console.log(bytes)
        }
    }
}