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
        dhtNode5: DhtNode,
        dhtNode6: DhtNode,
        dhtNode7: DhtNode,
        dhtNode8: DhtNode,
        dhtNode9: DhtNode,
        dhtNode10: DhtNode,
        dhtNode11: DhtNode,
        dhtNode12: DhtNode,
        dhtNode13: DhtNode

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
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(stringFromId(targetDescriptor.peerId))!.onIncomingMessage(peerDescriptor, bytes)
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
        dhtNode6 = createDhtNode('peer5')
        dhtNode7 = createDhtNode('peer6')
        dhtNode8 = createDhtNode('peer7')
        dhtNode9 = createDhtNode('peer8')
        dhtNode10 = createDhtNode('peer9')
        dhtNode11 = createDhtNode('peer10')
        dhtNode12 = createDhtNode('peer11')
        dhtNode13 = createDhtNode('peer12')
    })

    it('Happy path', async () => {
        await dhtNode1.joinDht(entrypoint)
        await dhtNode2.joinDht(entrypoint)
        await dhtNode3.joinDht(entrypoint)
        await dhtNode4.joinDht(entrypoint)
        await dhtNode5.joinDht(entrypoint)
        await dhtNode6.joinDht(entrypoint)
        await dhtNode7.joinDht(entrypoint)
        await dhtNode8.joinDht(entrypoint)
        await dhtNode9.joinDht(entrypoint)
        await dhtNode10.joinDht(entrypoint)
        await dhtNode11.joinDht(entrypoint)
        await dhtNode12.joinDht(entrypoint)
        await dhtNode13.joinDht(entrypoint)

        expect(dhtNode1.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode2.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode3.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode4.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode5.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode6.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode7.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode8.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode9.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode10.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode11.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode12.getNeighborList().getStringIds().length).toEqual(12)
        expect(dhtNode13.getNeighborList().getStringIds().length).toEqual(12)
    })

})