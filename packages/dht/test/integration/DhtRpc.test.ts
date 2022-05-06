import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { ITransport } from '../../src/transport/ITransport'
import { getMockPeers, MockRegisterDhtRpc } from '../../src/rpc-protocol/server'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { generateId } from '../../src/dht/helpers'
import { Message, PeerDescriptor } from '../../src/proto/DhtRpc'
import { wait } from 'streamr-test-utils'
import { Err } from '../../src/errors'

describe('DhtClientRpcTransport', () => {
    let clientTransport1: DhtTransportClient,
        clientTransport2: DhtTransportClient,
        serverTransport1: DhtTransportServer,
        serverTransport2: DhtTransportServer,
        mockConnectionLayer1: ITransport,
        mockConnectionLayer2: ITransport,
        rpcCommunicator1: RpcCommunicator,
        rpcCommunicator2: RpcCommunicator,
        client1: DhtRpcClient,
        client2: DhtRpcClient

    const peerDescriptor1: PeerDescriptor = {
        peerId: generateId('peer1'),
        type: 0
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: generateId('peer2'),
        type: 0
    }

    beforeEach(() => {
        clientTransport1 = new DhtTransportClient()
        serverTransport1 = new DhtTransportServer()
        serverTransport1.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
        mockConnectionLayer1 = new MockConnectionManager()
        rpcCommunicator1 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer1,
            dhtTransportClient: clientTransport1,
            dhtTransportServer: serverTransport1
        })

        clientTransport2 = new DhtTransportClient()
        serverTransport2 = new DhtTransportServer()
        serverTransport2.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
        mockConnectionLayer2 = new MockConnectionManager()
        rpcCommunicator2 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer2,
            dhtTransportClient: clientTransport2,
            dhtTransportServer: serverTransport2
        })

        rpcCommunicator1.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator2.onIncomingMessage(peerDescriptor, message)
        })
        
        rpcCommunicator2.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator1.onIncomingMessage(peerDescriptor, message)
        })

        client1 = new DhtRpcClient(clientTransport1)
        client2 = new DhtRpcClient(clientTransport2)
    })

    afterEach(async () => {
        await rpcCommunicator1.stop()
        await rpcCommunicator2.stop()
        await serverTransport1.stop()
        await serverTransport2.stop()
        await clientTransport1.stop()
        await clientTransport2.stop()
    })
    
    it('Happy path', async () => {
        const response1 = client1.getClosestPeers(
            { peerDescriptor: peerDescriptor1, nonce: '1' },
            { targetDescriptor: peerDescriptor2 }
        )
        const res1 = await response1.response
        expect(res1.peers).toEqual(getMockPeers())

        const response2 = client2.getClosestPeers(
            { peerDescriptor: peerDescriptor2, nonce: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        const res2 = await response2.response
        expect(res2.peers).toEqual(getMockPeers())
    })
    
    it('Default RPC timeout, client side', async () => {
        rpcCommunicator2.setSendFn(async (_peerDescriptor: PeerDescriptor, _messsage: Message) => {
            await wait(3000)
        })
        const response2 = client2.getClosestPeers(
            { peerDescriptor: peerDescriptor2, nonce: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        await expect(response2.response).rejects.toEqual(
            new Err.RpcTimeout('Rpc request timed out')
        )
    })

    it('Server side timeout', async () => {
        serverTransport1.registerMethod('getClosestPeers', async () => {
            await wait(3000)
            return new Uint8Array()
        })
        const response = client2.getClosestPeers(
            { peerDescriptor: peerDescriptor2, nonce: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        await expect(response.response).rejects.toEqual(
            new Err.RpcTimeout('Server error on request')
        )
    })
    
    it('Server responds with error on unknown method', async () => {
        const response = client2.ping(
            { nonce: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        await expect(response.response).rejects.toEqual(
            new Err.UnknownRpcMethod('Server does not implement method ping')
        )
    })
})
