import { ITransport } from '../../src/transport/ITransport'
import { getMockPeers, MockRegisterDhtRpc } from '../utils'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { generateId } from '../../src/dht/helpers'
import { Message, PeerDescriptor } from '../../src/proto/DhtRpc'
import { wait } from 'streamr-test-utils'
import { Err } from '../../src/errors'
import { Simulator } from '../../src/connection/Simulator'

describe('DhtRpc', () => {
    let mockConnectionLayer1: ITransport,
        mockConnectionLayer2: ITransport,
        rpcCommunicator1: RpcCommunicator,
        rpcCommunicator2: RpcCommunicator,
        client1: DhtRpcClient,
        client2: DhtRpcClient

    const simulator = new Simulator()
    const peerDescriptor1: PeerDescriptor = {
        peerId: generateId('peer1'),
        type: 0
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: generateId('peer2'),
        type: 0
    }

    beforeEach(() => {
        mockConnectionLayer1 = new MockConnectionManager(peerDescriptor1, simulator)
        rpcCommunicator1 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer1
        })
        rpcCommunicator1.registerServerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)

        mockConnectionLayer2 = new MockConnectionManager(peerDescriptor2, simulator)
        rpcCommunicator2 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer2,
        })
        rpcCommunicator2.registerServerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)

        rpcCommunicator1.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator2.onIncomingMessage(peerDescriptor, message)
        })

        rpcCommunicator2.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator1.onIncomingMessage(peerDescriptor, message)
        })
        
        client1 = new DhtRpcClient(rpcCommunicator1.getRpcClientTransport())
        client2 = new DhtRpcClient(rpcCommunicator1.getRpcClientTransport())
    })

    afterEach(async () => {
        await rpcCommunicator1.stop()
        await rpcCommunicator2.stop()
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
        let timeout: NodeJS.Timeout
        rpcCommunicator2.registerServerMethod('getClosestPeers', () => {
            return new Promise(async (resolve, _reject) => {
                timeout = setTimeout(() => {
                    resolve(new Uint8Array())
                }, 5000)
            })
        })
        const response = client2.getClosestPeers(
            { peerDescriptor: peerDescriptor2, nonce: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        await expect(response.response).rejects.toEqual(
            new Err.RpcTimeout('Server error on request')
        )
        clearTimeout(timeout!)
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
