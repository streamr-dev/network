import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtNode } from '../../src/dht/DhtNode'
import { Message, PeerDescriptor } from '../../src/proto/DhtRpc'
import { createMockConnectionDhtNode, createMockConnectionLayer1Node } from '../utils'
import { PeerID } from '../../src/PeerID'

describe('Layer 1 on Layer 0 with mocked connections', () => {
    const layer0EntryPointId = '00000'
    const layer1EntryPointId = '91199'

    let layer0EntryPoint: DhtNode
    let layer1Node1: DhtNode

    let layer0Node1: DhtNode
    let layer1EntryPoint: DhtNode

    let layer0Node2: DhtNode
    let layer1Node2: DhtNode

    let layer0Node3: DhtNode
    let layer1Node3: DhtNode

    let layer0Node4: DhtNode
    let layer1Node4: DhtNode

    let entryPoint0Descriptor: PeerDescriptor
    let entryPoint1Descriptor: PeerDescriptor

    let layer0RpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(async () => {
        layer0RpcCommunicators = new Map()
        const layer0RpcSend = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, message: Message) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                layer0RpcCommunicators.get(PeerID.fromValue(targetDescriptor.peerId).toString())!.onIncomingMessage(senderDescriptor, message)
            }
        }

        layer0EntryPoint = createMockConnectionDhtNode(layer0EntryPointId)
        layer0EntryPoint.getRpcCommunicator().setSendFn(layer0RpcSend(layer0EntryPoint.getPeerDescriptor()))
        layer0RpcCommunicators.set(PeerID.fromString(layer0EntryPointId).toString(), layer0EntryPoint.getRpcCommunicator())

        layer0Node1 = createMockConnectionDhtNode(layer1EntryPointId)
        layer0Node1.getRpcCommunicator().setSendFn(layer0RpcSend(layer0Node1.getPeerDescriptor()))
        layer0RpcCommunicators.set(PeerID.fromString(layer1EntryPointId).toString(), layer0Node1.getRpcCommunicator())

        const layer0Node2Id = 'layer0Node2'
        layer0Node2 = createMockConnectionDhtNode(layer0Node2Id)
        layer0Node2.getRpcCommunicator().setSendFn(layer0RpcSend(layer0Node2.getPeerDescriptor()))
        layer0RpcCommunicators.set(PeerID.fromString(layer0Node2Id).toString(), layer0Node2.getRpcCommunicator())

        const layer0Node3Id = 'layer0Node3'
        layer0Node3 = createMockConnectionDhtNode(layer0Node3Id)
        layer0Node3.getRpcCommunicator().setSendFn(layer0RpcSend(layer0Node3.getPeerDescriptor()))
        layer0RpcCommunicators.set(PeerID.fromString(layer0Node3Id).toString(), layer0Node3.getRpcCommunicator())

        const layer0Node4Id = 'layer0Node4'
        layer0Node4 = createMockConnectionDhtNode(layer0Node4Id)
        layer0Node4.getRpcCommunicator().setSendFn(layer0RpcSend(layer0Node4.getPeerDescriptor()))
        layer0RpcCommunicators.set(PeerID.fromString(layer0Node4Id).toString(), layer0Node4.getRpcCommunicator())

        layer1EntryPoint = createMockConnectionLayer1Node(layer1EntryPointId, layer0Node1)
        layer1Node1 = createMockConnectionLayer1Node(layer0EntryPointId, layer0EntryPoint)
        layer1Node2 = createMockConnectionLayer1Node(layer0Node2Id, layer0Node2)
        layer1Node3 = createMockConnectionLayer1Node(layer0Node3Id, layer0Node3)
        layer1Node4 = createMockConnectionLayer1Node(layer0Node4Id, layer0Node4)

        entryPoint0Descriptor = {
            peerId: layer0EntryPoint.getSelfId().value,
            type: 0
        }

        entryPoint1Descriptor = {
            peerId: layer1EntryPoint.getSelfId().value,
            type: 0
        }

        await layer0EntryPoint.joinDht(entryPoint0Descriptor)
        await layer1EntryPoint.joinDht(entryPoint1Descriptor)
    })

    afterEach(async () => {
        await Promise.all([
            layer0EntryPoint.stop(),
            layer0Node1.stop(),
            layer0Node2.stop(),
            layer0Node3.stop(),
            layer0Node4.stop(),
            layer1EntryPoint.stop(),
            layer1Node1.stop(),
            layer1Node2.stop(),
            layer1Node3.stop(),
            layer1Node4.stop()
        ])
    })

    it('Happy Path', async () => {
        await Promise.all([
            layer0Node1.joinDht(entryPoint0Descriptor),
            layer0Node2.joinDht(entryPoint0Descriptor),
            layer0Node3.joinDht(entryPoint0Descriptor),
            layer0Node4.joinDht(entryPoint0Descriptor)
        ])

        await Promise.all([
            layer1Node1.joinDht(entryPoint1Descriptor),
            layer1Node2.joinDht(entryPoint1Descriptor),
            layer1Node3.joinDht(entryPoint1Descriptor),
            layer1Node4.joinDht(entryPoint1Descriptor)
        ])

        expect(layer1Node1.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node2.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node3.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node4.getBucketSize()).toBeGreaterThanOrEqual(2)
    }, 15000)
})
