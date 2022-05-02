import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/PeerID'
import { createMockConnectionDhtNode } from '../utils'

describe('Mock Connection DHT Joining', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]

    let entrypointDescriptor: PeerDescriptor

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(() => {
        rpcCommunicators = new Map()
        const rpcFuntion = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(PeerID.fromValue(targetDescriptor.peerId).toString())!.onIncomingMessage(senderDescriptor, bytes)
            }
        }
        nodes = []

        const entryPointId = '0'
        entryPoint = createMockConnectionDhtNode(entryPointId)
        entryPoint.getRpcCommunicator().setSendFn(rpcFuntion(entryPoint.getPeerDescriptor()))
        rpcCommunicators.set(PeerID.fromString(entryPointId).toString(), entryPoint.getRpcCommunicator())

        entrypointDescriptor = {
            peerId: entryPoint.getSelfId().value,
            type: 0
        }
       
        for (let i = 1; i < 100; i++) {
            const nodeId = `${i}`
            const node = createMockConnectionDhtNode(nodeId)
            node.getRpcCommunicator().setSendFn(rpcFuntion(node.getPeerDescriptor()))
            rpcCommunicators.set(PeerID.fromString(nodeId).toString(), node.getRpcCommunicator())
            nodes.push(node)
        }
    })

    it ('Happy path', async () => {
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.allSettled(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK())
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() * 2)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
    })
})