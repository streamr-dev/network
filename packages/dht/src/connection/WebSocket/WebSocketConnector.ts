require('setimmediate')
import { EventEmitter } from 'events'
import {
    IConnectionSource,
    Event as ConnectionSourceEvent,
    Event as ConnectionSourceEvents
} from '../IConnectionSource'
import { ClientWebSocket } from './ClientWebSocket'
import { Event as ConnectionEvents, Event as ConnectionEvent, IConnection } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { RpcCommunicator } from '../../transport/RpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    HandshakeMessage,
    Message,
    MessageType,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/DhtRpc'
import { WebSocketConnectorClient } from '../../proto/DhtRpc.client'
import { DeferredConnection } from '../DeferredConnection'
import { TODO } from '../../types'
import { Logger } from '../../helpers/Logger'
import { IWebSocketConnector } from '../../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RpcAdapter } from '../../transport/RpcAdapter'
import { v4 } from 'uuid'

const logger = new Logger(module)

export class WebSocketConnector extends EventEmitter implements IConnectionSource, IWebSocketConnector {
    private WESOCKET_CONNECTOR_APP_ID = "websocketconnector"
    private rpcCommunicator: RpcCommunicator
    private rpcAdapter: RpcAdapter
    private ownPeerDescriptor: PeerDescriptor | null = null
    private canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean

    constructor(
        private rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    ) {
        super()
        this.canConnectFunction = fnCanConnect.bind(this)

        this.rpcCommunicator = new RpcCommunicator({
            rpcRequestTimeout: 10000
        })

        this.requestConnection = this.requestConnection.bind(this)

        this.rpcCommunicator.registerRpcMethod(
            WebSocketConnectionRequest,
            WebSocketConnectionResponse,
            'requestConnection',
            this.requestConnection
        )
        this.rpcAdapter = new RpcAdapter(this.WESOCKET_CONNECTOR_APP_ID, this.rpcTransport, this.rpcCommunicator)
    }

    connect({ host, port, url, ownPeerDescriptor, targetPeerDescriptor }: {
        host?: string,
        port?: number,
        url?: string,
        ownPeerDescriptor?: PeerDescriptor,
        targetPeerDescriptor?: PeerDescriptor
    } = {}
    ): IConnection {

        if (!host && !port && !url && ownPeerDescriptor && targetPeerDescriptor) {
            return this.requestConnectionFromPeer(ownPeerDescriptor, targetPeerDescriptor)
        }
        const socket = new ClientWebSocket()

        socket.once(ConnectionEvent.CONNECTED, () => {
            this.emit(ConnectionSourceEvent.CONNECTED, socket)
        })

        let address = ''
        if (url) {
            address = url
        }
        else if (host && port) {
            address = 'ws://' + host + ':' + port
        }

        socket.connect(address)
        return socket
    }

    connectAsync({ host, port, url, timeoutMs }:
        { host?: string; port?: number; url?: string; timeoutMs: number } = { timeoutMs: 1000 }): Promise<IConnection> {

        return new Promise((resolve, reject) => {
            const socket = new ClientWebSocket()

            const connectHandler = () => {
                clearTimeout(timeout)
                socket.off(ConnectionEvent.ERROR, errorHandler)
                resolve(socket)
            }

            const errorHandler = () => {
                //console.log('errorHandler of WebSocketConnector::connectAsync()')
                clearTimeout(timeout)
                reject()
            }

            const timeoutHandler = () => {
                socket.off(ConnectionEvent.ERROR, errorHandler)
                reject()
            }

            const timeout = setTimeout(timeoutHandler, timeoutMs)

            socket.once(ConnectionEvent.CONNECTED, connectHandler)
            socket.once(ConnectionEvent.ERROR, errorHandler)

            let address = ''
            if (url) {
                address = url
            }
            else if (host && port) {
                address = 'ws://' + host + ':' + port
            }

            socket.connect(address)
        })
    }

    // Security check
    withinPortRange(port: number): boolean {
        // Check that requested connections is withing acceted range
        return !!port
    }

    requestConnectionFromPeer(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): IConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                new WebSocketConnectorClient(this.rpcCommunicator.getRpcClientTransport())
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.ip, ownPeerDescriptor.websocket!.port)
        })
        return new DeferredConnection(targetPeerDescriptor)
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    bindListeners(incomingMessageHandler: TODO, protocolVersion: string): void {
        // set up normal listeners that send a handshake for new connections from webSocketConnector
        this.on(ConnectionSourceEvents.CONNECTED, (connection: IConnection) => {
            connection.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
                const message = Message.fromBinary(data)
                if (this.ownPeerDescriptor) {
                    incomingMessageHandler(connection, message)
                }
            })

            if (this.ownPeerDescriptor) {
                logger.trace(`Initiating handshake with ${connection.getPeerDescriptor()?.peerId.toString()}`)
                const outgoingHandshake: HandshakeMessage = {
                    sourceId: this.ownPeerDescriptor.peerId,
                    protocolVersion: protocolVersion,
                    peerDescriptor: this.ownPeerDescriptor
                }

                const msg: Message = {
                    appId: this.WESOCKET_CONNECTOR_APP_ID,
                    messageType: MessageType.HANDSHAKE,
                    messageId: v4(),
                    body: HandshakeMessage.toBinary(outgoingHandshake)
                }

                connection.send(Message.toBinary(msg))
                connection.sendBufferedMessages()
            }
        })
    }

    stop(): void {
        this.rpcCommunicator.stop()
    }

    // IWebSocketConnector implementation
    async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        if (this.canConnectFunction(request.requester!, request.ip, request.port)) {
            setImmediate(() => this.connect({ host: request.ip, port: request.port }))
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
