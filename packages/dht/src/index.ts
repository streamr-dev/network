import { ClientTransport } from './transport/ClientTransport'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { RpcCommunicator } from './transport/RpcCommunicator'
import { MockConnectionManager } from './connection/MockConnectionManager'
import { ServerTransport } from './transport/ServerTransport'
import { DhtNode } from './dht/DhtNode'
import { PeerID } from './PeerID'
import { NodeType, PeerDescriptor } from './proto/DhtRpc'

const main = async () => {
    const id = PeerID.fromString('peer')
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }
    const clientTransport = new ClientTransport()
    const serverTransport = new ServerTransport()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: mockConnectionLayer,
        dhtTransportClient: clientTransport,
        dhtTransportServer: serverTransport
    })
    const client = new DhtRpcClient(clientTransport)
    new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

main()