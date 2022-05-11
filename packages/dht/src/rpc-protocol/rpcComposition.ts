import { PeerDescriptor } from '../proto/DhtRpc'
import { ClientTransport } from '../transport/ClientTransport'
import { ServerTransport } from '../transport/ServerTransport'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { WebSocketConnectorClient } from '../proto/DhtRpc.client'
import { ConnectionManager } from '../connection/ConnectionManager'

export const createWebSocketConnectorRpc = (
    peerDescriptor: PeerDescriptor,
    connectionManager: ConnectionManager
): [RpcCommunicator, WebSocketConnectorClient] => {
    const clientTransport = new ClientTransport()
    const serverTransport = new ServerTransport()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: connectionManager,
        dhtTransportClient: clientTransport,
        dhtTransportServer: serverTransport,
        appId: 'websocket'
    })
    const client = new WebSocketConnectorClient(clientTransport)
    rpcCommunicator.setSendFn((peerDescriptor, message) => {
        connectionManager.send(peerDescriptor, message)
    })
    return [rpcCommunicator, client]
}

