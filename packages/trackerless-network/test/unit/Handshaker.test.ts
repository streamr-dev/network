import { ListeningRpcCommunicator, Simulator, SimulatorTransport, toNodeId } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { range } from 'lodash'
import { NodeList } from '../../src/logic/NodeList'
import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import { createMockContentDeliveryRpcRemote, createMockPeerDescriptor } from '../utils/utils'

describe('Handshaker', () => {
    let handshaker: Handshaker
    const peerDescriptor = createMockPeerDescriptor()

    const maxNeighborCount = 4
    const streamPartId = StreamPartIDUtils.parse('stream#0')

    let neighbors: NodeList
    let leftNodeView: NodeList
    let rightNodeView: NodeList
    let nearbyNodeView: NodeList
    let randomNodeView: NodeList

    let simulator: Simulator
    let simulatorTransport: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator()
        simulatorTransport = new SimulatorTransport(peerDescriptor, simulator)
        await simulatorTransport.start()
        const rpcCommunicator = new ListeningRpcCommunicator(streamPartId, simulatorTransport)

        const nodeId = toNodeId(peerDescriptor)
        neighbors = new NodeList(nodeId, 10)
        leftNodeView = new NodeList(nodeId, 20)
        rightNodeView = new NodeList(nodeId, 20)
        nearbyNodeView = new NodeList(nodeId, 20)
        randomNodeView = new NodeList(nodeId, 20)

        handshaker = new Handshaker({
            localPeerDescriptor: peerDescriptor,
            streamPartId,
            neighbors,
            leftNodeView,
            rightNodeView,
            nearbyNodeView,
            randomNodeView,
            rpcCommunicator,
            maxNeighborCount,
            rpcRequestTimeout: 5000,
            ongoingHandshakes: new Set()
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
        range(2).forEach(() => randomNodeView.add(createMockContentDeliveryRpcRemote()))
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(2)
    })
})
