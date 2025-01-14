import { createMockDhtRpc, createMockPeerDescriptor, createMockPeers } from '../utils/utils'
import { ProtoRpcClient, RpcCommunicator, RpcError, toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtNodeRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { ClosestPeersRequest, ClosestPeersResponse } from '../../generated/packages/dht/protos/DhtRpc'
import { wait } from '@streamr/utils'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { toNodeId } from '../../src/identifiers'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('DhtRpc', () => {
    let rpcCommunicator1: RpcCommunicator<DhtCallContext>
    let rpcCommunicator2: RpcCommunicator<DhtCallContext>
    let client1: ProtoRpcClient<DhtNodeRpcClient>
    let client2: ProtoRpcClient<DhtNodeRpcClient>
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    const neighbors = createMockPeers()
    const mockDhtRpc = createMockDhtRpc(neighbors)

    const outgoingListener2 = async (message: RpcMessage) => {
        rpcCommunicator1.handleIncomingMessage(message, new DhtCallContext())
    }

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator1.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            mockDhtRpc.getClosestPeers
        )

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            mockDhtRpc.getClosestPeers
        )

        rpcCommunicator1.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message, new DhtCallContext())
        })

        rpcCommunicator2.setOutgoingMessageListener(outgoingListener2)

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
                targetDescriptor: peerDescriptor2
            }
        )
        const res1 = await response1
        expect(res1.peers.map((p) => toNodeId(p))).toEqual(neighbors.map((n) => toNodeId(n)))

        const response2 = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        const res2 = await response2
        expect(res2.peers.map((p) => toNodeId(p))).toEqual(neighbors.map((n) => toNodeId(n)))
    })

    it('Default RPC timeout, client side', async () => {
        rpcCommunicator2.setOutgoingMessageListener(async () => {
            await wait(3000)
        })
        const response2 = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        await expect(response2).rejects.toEqual(new RpcError.RpcTimeout('Rpc request timed out'))
    }, 15000)

    it('Server side timeout', async () => {
        let timeout: NodeJS.Timeout

        async function respondGetClosestPeersWithTimeout(): Promise<ClosestPeersResponse> {
            const neighbors = createMockPeers()
            const response: ClosestPeersResponse = {
                peers: neighbors,
                requestId: 'why am i still here'
            }
            await wait(5000)
            return response
        }

        rpcCommunicator2.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            respondGetClosestPeersWithTimeout
        )
        const response = client2.getClosestPeers(
            { nodeId: peerDescriptor2.nodeId, requestId: '1' },
            {
                sourceDescriptor: peerDescriptor2,
                targetDescriptor: peerDescriptor1
            }
        )
        await expect(response).rejects.toEqual(new RpcError.RpcTimeout('Server timed out on request'))
        clearTimeout(timeout!)
    })

    it('Server responds with error on unknown method', async () => {
        const response = client2.ping({ requestId: '1' }, { targetDescriptor: peerDescriptor1 })
        await expect(response).rejects.toEqual(new RpcError.UnknownRpcMethod('Server does not implement method ping'))
    })
})
