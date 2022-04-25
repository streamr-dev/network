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
    let dhtNode1: DhtNode,
        dhtNode2: DhtNode,
        dhtNode3: DhtNode,
        dhtNode4: DhtNode,
        dhtNode5: DhtNode

    let entrypoint: DhtPeer

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeAll(() => {
        rpcCommunicators = new Map()
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
            rpcCommunicator.setSendFn((targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!peerDescriptor) {
                    throw new Error('peerdescriptor not set')
                }
                rpcCommunicators.get(stringFromId(peerDescriptor.peerId))!.onIncomingMessage(peerDescriptor, bytes)
            })
            return new DhtNode(id, client, serverTransport, rpcCommunicator)
        }

        dhtNode1 = createDhtNode('entrypoint')
        const entrypointDescriptor: PeerDescriptor = {
            peerId: dhtNode1.getSelfId(),
            type: 0
        }
        entrypoint = new DhtPeer(entrypointDescriptor, dhtNode1.getDhtRpcClient())
        dhtNode2 = createDhtNode('peer1')
        dhtNode3 = createDhtNode('peer2')
        dhtNode4 = createDhtNode('peer3')
        dhtNode5 = createDhtNode('peer4')
    })

    it('Happy path', async () => {
        await dhtNode1.joinDht(entrypoint)
        console.log("Node1 joined")
        await dhtNode2.joinDht(entrypoint)
        console.log("Node2 joined")
        await dhtNode3.joinDht(entrypoint)
        console.log("Node3 joined")
        await dhtNode4.joinDht(entrypoint)
        console.log("Node4 joined")
        await dhtNode5.joinDht(entrypoint)
        console.log("Node5 joined")
    })

})