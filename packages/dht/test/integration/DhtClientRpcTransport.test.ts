import { ClosestPeersResponse, RpcWrapper } from '../../src/proto/DhtRpc'
import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { MockConnectionLayer } from '../../src/connection/MockConnectionLayer'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { PeerID } from '../../src/types'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { getMockNeighbors } from '../../src/rpc-protocol/server'

describe('DhtClientRpcTransport', () => {

    beforeAll(() => {

    })

    it('Happy Path getClosestNeighbors', async () => {
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
