import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import { ListeningRpcCommunicator, PeerDescriptor,  Simulator, SimulatorTransport } from '@streamr/dht'
import { mockConnectionLocker, createMockRemoteNode, createRandomNodeId } from '../utils/utils'
import { NodeList } from '../../src/logic/NodeList'
import { range } from 'lodash'
import { hexToBinary } from '@streamr/utils'

describe('Handshaker', () => {

    let handshaker: Handshaker
    const nodeId = createRandomNodeId()
    const peerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(nodeId),
        type: 0
    }

    const N = 4
    const stream = 'stream#0'

    let targetNeighbors: NodeList
    let nearbyContactPool: NodeList
    let randomContactPool: NodeList

    let simulator: Simulator
    let simulatorTransport: SimulatorTransport
    
    beforeEach(() => {
        simulator = new Simulator()
        simulatorTransport = new SimulatorTransport(peerDescriptor, simulator)
        const rpcCommunicator = new ListeningRpcCommunicator(stream, simulatorTransport)

        targetNeighbors = new NodeList(nodeId, 10)
        nearbyContactPool = new NodeList(nodeId, 20)
        randomContactPool = new NodeList(nodeId, 20)

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

    afterEach(async () => {
        await simulatorTransport.stop()
        simulator.stop()
    })

    it('attemptHandshakesOnContact works with empty structures', async () => {
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(0)
    })

    it('attemptHandshakesOnContact with known nodes that cannot be connected to', async () => {
        range(2).forEach(() => nearbyContactPool.add(createMockRemoteNode()))
        const res = await handshaker.attemptHandshakesOnContacts([])
        expect(res.length).toEqual(2)
    })

})
