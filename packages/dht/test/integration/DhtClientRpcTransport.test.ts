import { ClosestPeersResponse, Neighbor, NodeType, RpcWrapper } from '../../src/proto/DhtRpc'
import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { MockConnectionLayer } from '../../src/connection/MockConnectionLayer'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { PeerID } from '../../src/types'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'

describe('DhtClientRpcTransport', () => {

    beforeAll(() => {

    })

    it('Happy Path getClosestNeighbors', async () => {
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
        expect(res.neighbors.length).toEqual(4)
        expect(res.neighbors[0]).toEqual(getMockNeighbors()[0])
        expect(res.neighbors[1]).toEqual(getMockNeighbors()[1])
        expect(res.neighbors[2]).toEqual(getMockNeighbors()[2])
        expect(res.neighbors[3]).toEqual(getMockNeighbors()[3])
    })
})
