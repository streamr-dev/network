import { ClosestPeersResponse, PeerDescriptor, RpcWrapper } from '../../src/proto/DhtRpc'
import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { getMockPeers } from '../../src/rpc-protocol/server'
import { generateId } from '../../src/dht/helpers'

describe('DhtClientRpcTransport', () => {

    beforeAll(() => {

    })

    it('Happy Path getClosestNeighbors', async () => {
        const clientTransport = new DhtTransportClient()
        const serverTransport = new DhtTransportServer()
        const mockConnectionManager = new MockConnectionManager()
        const rpcCommunicator = new RpcCommunicator(mockConnectionManager, clientTransport, serverTransport)
        rpcCommunicator.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
            const request = RpcWrapper.fromBinary(bytes)
            const responseBody: ClosestPeersResponse = {
                peers: getMockPeers(),
                nonce: 'TO BE REMOVED'
            }
            const response: RpcWrapper = {
                header: {
                    response: 'hiihii'
                },
                body: ClosestPeersResponse.toBinary(responseBody),
                requestId: request.requestId
            }
            rpcCommunicator.onIncomingMessage(peerDescriptor, RpcWrapper.toBinary(response))
        })

        const client = new DhtRpcClient(clientTransport)

        const peerDescriptor: PeerDescriptor = {
            peerId: generateId('peer'),
            type: 0
        }
        const response = client.getClosestPeers({peerDescriptor, nonce: '1'})
        const res = await response.response
        expect(res.peers.length).toEqual(4)
        expect(res.peers[0]).toEqual(getMockPeers()[0])
        expect(res.peers[1]).toEqual(getMockPeers()[1])
        expect(res.peers[2]).toEqual(getMockPeers()[2])
        expect(res.peers[3]).toEqual(getMockPeers()[3])
    })
})
