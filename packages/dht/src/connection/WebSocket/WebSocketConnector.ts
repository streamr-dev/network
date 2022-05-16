import { EventEmitter } from 'events'
import { IConnectionSource, Event as ConnectionSourceEvent } from '../IConnectionSource'
import { ClientWebSocket } from './ClientWebSocket'
import { Event as ConnectionEvent, IConnection } from '../IConnection'
import { Event as RpcTransportEvent, ITransport } from '../../transport/ITransport'
import { RpcCommunicator } from '../../transport/RpcCommunicator'
import { createRemoteWebSocketConnectorServer, RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import { PeerDescriptor } from '../../proto/DhtRpc'
import { WebSocketConnectorClient } from '../../proto/DhtRpc.client'
import { DeferredConnection } from '../DeferredConnection'

export class WebSocketConnector extends EventEmitter implements IConnectionSource {
    private rpcCommunicator: RpcCommunicator
    private transportListener: any = null
    constructor(private rpcTransport: ITransport, fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean) {
        super()
        this.rpcCommunicator = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "websocket",
            connectionLayer: rpcTransport
        })
        this.transportListener = rpcTransport.on(RpcTransportEvent.DATA, (peerDescriptor, message, appId) => {
            if (appId === 'websocket' && this.rpcCommunicator) {
                this.rpcCommunicator!.onIncomingMessage(peerDescriptor, message)
            }
        })
        const methods = createRemoteWebSocketConnectorServer(
            this.connect.bind(this),
            fnCanConnect
        )
        this.rpcCommunicator.registerServerMethod('requestConnection', methods.requestConnection)
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
            return this.requestConnection(ownPeerDescriptor, targetPeerDescriptor)
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

    requestConnection(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): IConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                new WebSocketConnectorClient(this.rpcCommunicator.getRpcClientTransport())
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.ip, ownPeerDescriptor.websocket!.port)
        })
        return new DeferredConnection(targetPeerDescriptor)
    }

    stop(): void {
        this.rpcCommunicator.stop()
    }

}
