import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { IConnectionManager } from '../../src/connection/IConnectionManager'
import { getMockPeers, MockRegisterDhtRpc } from '../../src/rpc-protocol/server'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { generateId } from '../../src/dht/helpers'
import { PeerDescriptor } from '../../src/proto/DhtRpc'

describe('DhtClientRpcTransport', () => {
    let clientTransport1: DhtTransportClient,
        clientTransport2: DhtTransportClient,
        serverTransport1: DhtTransportServer,
        serverTransport2: DhtTransportServer,
        mockConnectionLayer1: IConnectionManager,
        mockConnectionLayer2: IConnectionManager,
        rpcCommunicator1: RpcCommunicator,
        rpcCommunicator2: RpcCommunicator,
        client1: DhtRpcClient,
        client2: DhtRpcClient

    beforeAll(() => {
        clientTransport1 = new DhtTransportClient()
        serverTransport1 = new DhtTransportServer()
        serverTransport1.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
        mockConnectionLayer1 = new MockConnectionManager()
        rpcCommunicator1 = new RpcCommunicator(mockConnectionLayer1, clientTransport1, serverTransport1)

        clientTransport2 = new DhtTransportClient()
        serverTransport2 = new DhtTransportServer()
        serverTransport2.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
        mockConnectionLayer2 = new MockConnectionManager()
        rpcCommunicator2 = new RpcCommunicator(mockConnectionLayer2, clientTransport2, serverTransport2)

        rpcCommunicator1.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
            rpcCommunicator2.onIncomingMessage(peerDescriptor, bytes)
        })
        rpcCommunicator2.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
            rpcCommunicator1.onIncomingMessage(peerDescriptor, bytes)
        })

        client1 = new DhtRpcClient(clientTransport1)
        client2 = new DhtRpcClient(clientTransport2)
    })

    it('Happy path', async () => {

        const peerDescriptor1: PeerDescriptor = {
            peerId: generateId('peer1'),
            type: 0
        }

        const peerDescriptor2: PeerDescriptor = {
            peerId: generateId('peer2'),
            type: 0
        }
        const response1 = client1.getClosestPeers({ peerDescriptor: peerDescriptor1, nonce: '1' })
        const res1 = await response1.response
        expect(res1.peers).toEqual(getMockPeers())

        const response2 = client2.getClosestPeers({ peerDescriptor: peerDescriptor2, nonce: '1' })
        const res2 = await response2.response
        expect(res2.peers).toEqual(getMockPeers())
    })

})
