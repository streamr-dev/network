import { ListeningRpcCommunicator, Simulator, SimulatorTransport } from '@streamr/dht'
import { range } from 'lodash'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { NodeList } from '../../src/logic/NodeList'
import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import { createMockPeerDescriptor, createMockRemoteNode, mockConnectionLocker } from '../utils/utils'

describe('Handshaker', () => {

    let handshaker: Handshaker
    const peerDescriptor = createMockPeerDescriptor()

    const maxNeighborCount = 4
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

        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        targetNeighbors = new NodeList(nodeId, 10)
        nearbyNodeView = new NodeList(nodeId, 20)
        randomNodeView = new NodeList(nodeId, 20)

        handshaker = new Handshaker({
            ownPeerDescriptor: peerDescriptor,
            randomGraphId: stream,
            connectionLocker: mockConnectionLocker,
            targetNeighbors,
            nearbyNodeView,
            randomNodeView,
            rpcCommunicator,
            maxNeighborCount
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
