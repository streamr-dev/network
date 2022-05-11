import { DhtTransportClient } from './transport/DhtTransportClient'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { RpcCommunicator } from './transport/RpcCommunicator'
import { MockConnectionManager } from './connection/MockConnectionManager'
import { DhtTransportServer } from './transport/DhtTransportServer'
import { DhtNode } from './dht/DhtNode'
import { PeerID } from './PeerID'
import { NodeType, PeerDescriptor } from './proto/DhtRpc'

const main = async () => {
    const id = PeerID.fromString('peer')
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }
    const clientTransport = new DhtTransportClient()
    const serverTransport = new DhtTransportServer()
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