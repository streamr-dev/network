import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils/utils'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { Logger, hexToBinary } from '@streamr/utils'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { createRandomNodeId } from '../../src/helpers/nodeId'

const logger = new Logger(module)

const NUM_NODES = 80
const MAX_CONNECTIONS = 15
const K = 2

describe('Scaling down a Dht network', () => {

    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.REAL)

    beforeEach(async () => {
        nodes = []
        entryPoint = await createMockConnectionDhtNode('dummy', simulator,
            createRandomNodeId(), K, MAX_CONNECTIONS)
        nodes.push(entryPoint)

        entrypointDescriptor = {
            nodeId: hexToBinary(entryPoint.getNodeId()),
            type: NodeType.NODEJS,
            region: getRandomRegion()
        }

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, undefined, K, MAX_CONNECTIONS)
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
    }, 60000)

    afterEach(async () => {
        await Promise.all(nodes.map((node) => node.stop()))
    }, 10000)

    it('Remaining nodes cleaned up stopped nodes from states', async () => {
        const randomIndices = []
        for (let i = 1; i < nodes.length; i++) {
            randomIndices.push(i)
        }
        while (randomIndices.length > 1) {
            const index = Math.floor(Math.random() * randomIndices.length)
            const nodeIndex = randomIndices[index]
            randomIndices.splice(index, 1)
            const stoppingPeerDescriptor = nodes[nodeIndex].getLocalPeerDescriptor()
            await nodes[nodeIndex].stop()
            const nodeIsCleaned = nodes.every((node) =>
                node.getAllConnectionPeerDescriptors().every((peer) => {
                    if (areEqualPeerDescriptors(peer, stoppingPeerDescriptor)) {
                        logger.error(getNodeIdFromPeerDescriptor(node.getLocalPeerDescriptor()) + ', ' 
                            + getNodeIdFromPeerDescriptor(stoppingPeerDescriptor) + ' cleaning up failed')
                    }
                    return !areEqualPeerDescriptors(peer, stoppingPeerDescriptor)
                })
            )
            expect(nodeIsCleaned).toEqual(true)
        }
    }, 180000)
})
