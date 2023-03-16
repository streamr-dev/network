import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import { ListeningRpcCommunicator, PeerDescriptor, PeerID, Simulator, SimulatorTransport } from '@streamr/dht'
import { mockConnectionLocker, createMockRemotePeer } from '../utils'
import { PeerList } from '../../src/logic/PeerList'
import { range } from 'lodash'

describe('Handshaker', () => {

    let handshaker: Handshaker
    const peerId = PeerID.fromString('Handshaker')
    const peerDescriptor: PeerDescriptor = {
        kademliaId: peerId.value,
        type: 0
    }

    const N = 4
    const stream = 'stream#0'

    let targetNeighbors: PeerList
    let nearbyContactPool: PeerList
    let randomContactPool: PeerList

    beforeEach(() => {
        const simulator = new Simulator()
        const simulatorTransport = new SimulatorTransport(peerDescriptor, simulator)
        const rpcCommunicator = new ListeningRpcCommunicator(stream, simulatorTransport)

        targetNeighbors = new PeerList(peerId, 10)
        nearbyContactPool = new PeerList(peerId, 20)
        randomContactPool = new PeerList(peerId, 20)

        handshaker = new Handshaker({
            ownPeerDescriptor: peerDescriptor,
            randomGraphId: stream,
            connectionLocker: mockConnectionLocker,
            targetNeighbors,
            nearbyContactPool,
            randomContactPool,
            rpcCommunicator,
            N
        })
    })

    it('attemptHandshakesOnContact works with empty structures', async () => {
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(0)
        expect(handshaker.getOngoingHandshakes().size).toEqual(0)
    })

    it('attemptHandshakesOnContact with known peers that cannot be connected to', async () => {
        range(2).forEach(() => nearbyContactPool.add(createMockRemotePeer()))
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(2)
    })

})
