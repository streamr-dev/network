import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { IConnectionLayer } from '../../src/connection/IConnectionLayer'
import { MockRegisterDhtRpc, getMockNeighbors } from '../../src/rpc-protocol/server'
import { MockConnectionLayer } from '../../src/connection/MockConnectionLayer'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { PeerID } from '../../src/types'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { generateId } from '../../src/dht/helpers'
import { DhtNode } from '../../src/dht/DhtNode'

describe('DhtClientRpcTransport', () => {
    let dhtNode1: DhtNode,
        dhtNode2: DhtNode

    beforeAll(() => {
        const createDhtNode = (peerId: string): DhtNode => {
            const clientTransport = new DhtTransportClient()
            const serverTransport = new DhtTransportServer()
            const mockConnectionLayer = new MockConnectionLayer()
            const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
            const client = new DhtRpcClient(clientTransport)
            return new DhtNode(generateId(peerId), client, serverTransport, rpcCommunicator)
        }

        rpcCommunicator1.setSendFn((peerId: PeerID, bytes: Uint8Array) => {
            rpcCommunicator2.onIncomingMessage(bytes)
        })
        rpcCommunicator2.setSendFn((peerId: PeerID, bytes: Uint8Array) => {
            rpcCommunicator1.onIncomingMessage(bytes)
        })

        client1 = new DhtRpcClient(clientTransport1)
        client2 = new DhtRpcClient(clientTransport2)
    })

    it('Happy path', async () => {

        const response1 = client1.getClosestPeers({ peerId: generateId('peer'), nonce: '1' })
        const res1 = await response1.response
        expect(res1.neighbors).toEqual(getMockNeighbors())

        const response2 = client2.getClosestPeers({ peerId: generateId('peer'), nonce: '1' })
        const res2 = await response2.response
        expect(res2.neighbors).toEqual(getMockNeighbors())
    })

})