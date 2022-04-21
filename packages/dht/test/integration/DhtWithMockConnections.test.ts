import { DhtTransportClient } from '../../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../../src/transport/DhtTransportServer'
import { IConnectionLayer } from '../../src/connection/IConnectionLayer'
import { MockRegisterDhtRpc, getMockPeers } from '../../src/rpc-protocol/server'
import { MockConnectionLayer } from '../../src/connection/MockConnectionLayer'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { PeerID } from '../../src/types'
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
            const clientTransport = new DhtTransportClient()
            const serverTransport = new DhtTransportServer()
            const mockConnectionLayer = new MockConnectionLayer()
            const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
            const client = new DhtRpcClient(clientTransport)
            rpcCommunicators.set(stringId, rpcCommunicator)
            rpcCommunicator.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!peerDescriptor) {
                    throw new Error('peerdescriptor not set')
                }
                console.log(peerDescriptor)
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
        await dhtNode2.joinDht(entrypoint)
        await Promise.allSettled([
            dhtNode3.joinDht(entrypoint),
            dhtNode4.joinDht(entrypoint),
            dhtNode5.joinDht(entrypoint)
        ])
        // console.log(dhtNode1.getNeighborList())
        // console.log(dhtNode2.getNeighborList())
        // console.log(dhtNode3.getNeighborList())
        // console.log(dhtNode4.getNeighborList())
        // console.log(dhtNode5.getNeighborList())

    })

})