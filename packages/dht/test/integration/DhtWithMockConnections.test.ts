import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { stringFromId } from '../../src/dht/helpers'
import { DhtNode } from '../../src/dht/DhtNode'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'

describe('Mock Connection DHT Joining', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]

    let entryPointInfo: DhtPeer

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(() => {
        rpcCommunicators = new Map()
        const rpcFuntion = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(stringFromId(targetDescriptor.peerId))!.onIncomingMessage(senderDescriptor, bytes)
            }
        }
        nodes = []

        const entryPointId = '0'
        entryPoint = createMockConnectionDhtNode(entryPointId)
        entryPoint.getRpcCommunicator().setSendFn(rpcFuntion(entryPoint.getPeerDescriptor()))
        rpcCommunicators.set(entryPointId, entryPoint.getRpcCommunicator())

        entryPointInfo = new DhtPeer(entryPoint.getPeerDescriptor(), entryPoint.getDhtRpcClient())

        for (let i = 1; i < 100; i++) {
            const nodeId = `${i}`
            const node = createMockConnectionDhtNode(nodeId)
            node.getRpcCommunicator().setSendFn(rpcFuntion(node.getPeerDescriptor()))
            rpcCommunicators.set(nodeId, node.getRpcCommunicator())
            nodes.push(node)
        }
    })

    it ('Happy path', async () => {
        await entryPoint.joinDht(entryPointInfo)
        await Promise.allSettled(
            nodes.map((node) => node.joinDht(entryPointInfo))
        )
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK())
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() * 2)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
    })
})