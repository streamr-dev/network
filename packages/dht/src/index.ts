import { DhtTransportClient } from './transport/DhtTransportClient'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { RpcCommunicator } from './transport/RpcCommunicator'
import { MockConnectionLayer } from './connection/MockConnectionLayer'
import { DhtTransportServer } from './transport/DhtTransportServer'
import { PeerID } from './types'
import { ClosestPeersResponse, Neighbor, NodeType, RpcWrapper } from './proto/DhtRpc'

const getMockNeighbors = () => {
    const n1: Neighbor = {
        peerId: 'Neighbor1',
        type: NodeType.NODEJS,
    }
    const n2: Neighbor = {
        peerId: 'Neighbor2',
        type: NodeType.NODEJS,
    }
    const n3: Neighbor = {
        peerId: 'Neighbor3',
        type: NodeType.NODEJS,
    }
    const n4: Neighbor = {
        peerId: 'Neighbor1',
        type: NodeType.BROWSER,
    }
    return [
        n1, n2, n3, n4
    ]
}
const main = async () => {

    const clientTransport = new DhtTransportClient()
    const serverTransport = new DhtTransportServer()
    const mockConnectionLayer = new MockConnectionLayer()
    const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
    rpcCommunicator.setSendFn((peerId: PeerID, bytes: Uint8Array) => {
        const request = RpcWrapper.fromBinary(bytes)
        const responseBody: ClosestPeersResponse = {
            neighbors: getMockNeighbors(),
            nonce: 'TO BE REMOVED'
        }
        const response: RpcWrapper = {
            header: {
                response: 'hiihii'
            },
            body: ClosestPeersResponse.toBinary(responseBody),
            requestId: request.requestId
        }
        rpcCommunicator.onIncomingMessage(RpcWrapper.toBinary(response))
    })

    const client = new DhtRpcClient(clientTransport)

    const response = client.getClosestPeers({peerId: 'peer', nonce: '1'})
    const res = await response.response
    console.log(res)
}

main()