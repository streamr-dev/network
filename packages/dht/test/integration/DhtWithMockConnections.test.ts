import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/PeerID'

describe('DhtClientRpcTransport', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]

    let entrypointDescriptor: PeerDescriptor

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(() => {
        rpcCommunicators = new Map()
        nodes = []
        const createDhtNode = (stringId: string): DhtNode => {
            
            const pId = PeerID.fromString(stringId)
            const peerDescriptor: PeerDescriptor = {
                peerId: pId.value,
                type: 0
            }
            const clientTransport = new DhtTransportClient()
            const serverTransport = new DhtTransportServer()
            const mockConnectionLayer = new MockConnectionManager()
            const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
            const client = new DhtRpcClient(clientTransport)
            rpcCommunicators.set(pId.toString(), rpcCommunicator)
            rpcCommunicator.setSendFn(async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                if (!rpcCommunicators.has(PeerID.fromValue(targetDescriptor.peerId).toString())) {
                    console.error(PeerID.fromValue(targetDescriptor.peerId).toString() + 'does not exist!!')
                    throw new Error('peer not found')
                }
                rpcCommunicators.get(PeerID.fromValue(targetDescriptor.peerId).toString())!.onIncomingMessage(peerDescriptor, bytes)
            })
            return new DhtNode(pId, client, serverTransport, rpcCommunicator)
        }

        entryPoint = createDhtNode('0')
        entrypointDescriptor = {
            peerId: entryPoint.getSelfId().value,
            type: 0
        }
       
        for (let i = 1; i < 100; i++) {
            const node = createDhtNode(`${i}`)
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