import { getMockPeers, MockDhtRpc } from '../utils/utils'
import { ProtoRpcClient, RpcCommunicator, RpcError, toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtNodeRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { generateId } from '../utils/utils'
import { ClosestPeersRequest, ClosestPeersResponse, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { wait } from '@streamr/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

describe('DhtRpc', () => {
    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client1: ProtoRpcClient<DhtNodeRpcClient>
    let client2: ProtoRpcClient<DhtNodeRpcClient>

    const peerDescriptor1: PeerDescriptor = {
        nodeId: generateId('peer1'),
        type: NodeType.NODEJS
    }

    const peerDescriptor2: PeerDescriptor = {
        nodeId: generateId('peer2'),
        type: NodeType.NODEJS
    }

    const outgoingListener2 = (message: RpcMessage) => {
        rpcCommunicator1.handleIncomingMessage(message)
    }

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator1.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.getClosestPeers)

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.getClosestPeers)

        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })

        rpcCommunicator2.on('outgoingMessage', outgoingListener2)

        client1 = toProtoRpcClient(new DhtNodeRpcClient(rpcCommunicator1.getRpcClientTransport()))
        client2 = toProtoRpcClient(new DhtNodeRpcClient(rpcCommunicator1.getRpcClientTransport()))
    })

    afterEach(async () => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('Happy path', async () => {
        const response1 = client1.getClosestPeers(
            { nodeId: peerDescriptor1.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor1,
                targetDescriptor: peerDescriptor2,
            }
        )
        const res1 = await response1
        expect(res1.peers).toEqual(getMockPeers())

        const response2 = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        const res2 = await response2
        expect(res2.peers).toEqual(getMockPeers())
    })

    it('Default RPC timeout, client side', async () => {
        rpcCommunicator2.off('outgoingMessage', outgoingListener2)
        rpcCommunicator2.on('outgoingMessage', async () => {
            await wait(3000)
        })
        const response2 = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        await expect(response2).rejects.toEqual(
            new RpcError.RpcTimeout('Rpc request timed out')
        )
    }, 15000)

    it('Server side timeout', async () => {
        let timeout: NodeJS.Timeout

        async function respondGetClosestPeersWithTimeout(): Promise<ClosestPeersResponse> {
            const neighbors = getMockPeers()
            const response: ClosestPeersResponse = {
                peers: neighbors,
                requestId: 'why am i still here'
            }
            await wait(5000)
            return response
        }

        rpcCommunicator2.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', respondGetClosestPeersWithTimeout)
        const response = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        await expect(response).rejects.toEqual(
            new RpcError.RpcTimeout('Server timed out on request')
        )
        clearTimeout(timeout!)
    })

    it('Server responds with error on unknown method', async () => {
        const response = client2.ping(
            { requestId: '1' },
            { targetDescriptor: peerDescriptor1 }
        )
        await expect(response).rejects.toEqual(
            new RpcError.UnknownRpcMethod('Server does not implement method ping')
        )
    })
})
