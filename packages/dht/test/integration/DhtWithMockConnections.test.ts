import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { generateId, stringFromId } from '../../src/dht/helpers'
import { DhtNode } from '../../src/dht/DhtNode'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { PeerDescriptor } from '../../src/proto/DhtRpc'

describe('DhtClientRpcTransport', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]

    let entryPointInfo: DhtPeer

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(() => {
        rpcCommunicators = new Map()
        nodes = []
        const createDhtNode = (stringId: string): DhtNode => {
            const id = generateId(stringId)
            const peerDescriptor: PeerDescriptor = {
                peerId: id,
                type: 0
            }
            const clientTransport = new DhtTransportClient()
            const serverTransport = new DhtTransportServer()
            const mockConnectionLayer = new MockConnectionManager()
            const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
            const client = new DhtRpcClient(clientTransport)
            rpcCommunicators.set(stringId, rpcCommunicator)
            rpcCommunicator.setSendFn(async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(stringFromId(targetDescriptor.peerId))!.onIncomingMessage(peerDescriptor, bytes)
            })
            return new DhtNode(id, client, serverTransport, rpcCommunicator)
        }

        entryPoint = createDhtNode('0')
        const entrypointDescriptor: PeerDescriptor = {
            peerId: entryPoint.getSelfId(),
            type: 0
        }
        entryPointInfo = new DhtPeer(entrypointDescriptor, entryPoint.getDhtRpcClient())
        for (let i = 1; i < 100; i++) {
            const node = createDhtNode(`${i}`)
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