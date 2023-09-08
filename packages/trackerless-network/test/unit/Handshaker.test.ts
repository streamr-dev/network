import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import { ListeningRpcCommunicator, PeerDescriptor, PeerID, Simulator, SimulatorTransport } from '@streamr/dht'
import { mockConnectionLocker, createMockRemoteNode } from '../utils/utils'
import { NodeList } from '../../src/logic/NodeList'
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

    let targetNeighbors: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let simulator: Simulator
    let simulatorTransport: SimulatorTransport
    
    beforeEach(() => {
        simulator = new Simulator()
        simulatorTransport = new SimulatorTransport(peerDescriptor, simulator)
        const rpcCommunicator = new ListeningRpcCommunicator(stream, simulatorTransport)

        targetNeighbors = new NodeList(peerId, 10)
        nearbyNodeView = new NodeList(peerId, 20)
        randomNodeView = new NodeList(peerId, 20)

        handshaker = new Handshaker({
            ownPeerDescriptor: peerDescriptor,
            randomGraphId: stream,
            connectionLocker: mockConnectionLocker,
            targetNeighbors,
            nearbyNodeView,
            randomNodeView,
            rpcCommunicator,
            N
        })
    })

    afterEach(async () => {
        await simulatorTransport.stop()
        simulator.stop()
    })

    it('attemptHandshakesOnContact works with empty structures', async () => {
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(0)
    })

    it('attemptHandshakesOnContact with known nodes that cannot be connected to', async () => {
        range(2).forEach(() => nearbyNodeView.add(createMockRemoteNode()))
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(2)
    })

})
