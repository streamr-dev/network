/* eslint-disable @typescript-eslint/parameter-properties */

import { DhtNode, Simulator, PeerDescriptor, PeerID, ConnectionManager, getRandomRegion } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { range } from 'lodash'
import { wait, waitForCondition, waitForEvent3 } from '@streamr/utils'
import { Logger } from '@streamr/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { EventEmitter } from 'eventemitter3'

const logger = new Logger(module)

interface SuccessEvents {
    success: () => void
}

class SuccessListener extends EventEmitter<SuccessEvents> {

    private numNeighbors = 0
    private numNearby = 0

    constructor(private node: RandomGraphNode,
        private wantedNumNeighbors: number,
        private wantedNumNearby: number) {

        super()
        node.on('targetNeighborConnected', this.onTargetNeighborConnected)
        node.on('nearbyContactPoolIdAdded', this.onNearbyContactPoolIdAdded)
    }

    private onTargetNeighborConnected = (_stringId: string) => {
        this.numNeighbors++

        if (this.numNeighbors >= this.wantedNumNeighbors
            && this.numNearby >= this.wantedNumNearby) {
            this.node.off('targetNeighborConnected', this.onTargetNeighborConnected)
            this.node.off('nearbyContactPoolIdAdded', this.onNearbyContactPoolIdAdded)
            this.emit('success')
        }
    }

    private onNearbyContactPoolIdAdded = () => {
        this.numNearby++

        if (this.numNeighbors >= this.wantedNumNeighbors
            && this.numNearby >= this.wantedNumNearby) {
            this.node.off('targetNeighborConnected', this.onTargetNeighborConnected)
            this.node.off('nearbyContactPoolIdAdded', this.onNearbyContactPoolIdAdded)
            this.emit('success')
        }
    }

    public async waitForSuccess(timeout: number): Promise<void> {
        if (this.numNeighbors >= this.wantedNumNeighbors
            && this.numNearby >= this.wantedNumNearby) {
            return
        } else {
            await waitForEvent3<SuccessEvents>(this, 'success', timeout)
        }
    }
}

describe('RandomGraphNode-DhtNode', () => {
    const numOfNodes = 64
    let dhtNodes: DhtNode[]
    let dhtEntryPoint: DhtNode
    let entryPointRandomGraphNode: RandomGraphNode
    let graphNodes: RandomGraphNode[]

    const streamId = 'Stream1'
    const entrypointDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        nodeName: 'entrypoint',
        type: 0,
        region: getRandomRegion()
    }

    const peerDescriptors: PeerDescriptor[] = range(numOfNodes).map((i) => {
        return {
            kademliaId: PeerID.fromString(`${i}`).value,
            nodeName: `node${i}`,
            type: 0,
            region: getRandomRegion()
        }
    })
    beforeEach(async () => {

        Simulator.useFakeTimers()
        const simulator = new Simulator()
        const entrypointCm = new ConnectionManager({
            ownPeerDescriptor: entrypointDescriptor,
            nodeName: entrypointDescriptor.nodeName, simulator: simulator
        })

        const cms: ConnectionManager[] = range(numOfNodes).map((i) =>
            new ConnectionManager({
                ownPeerDescriptor: peerDescriptors[i],
                nodeName: peerDescriptors[i].nodeName,
                simulator: simulator
            })
        )

        dhtEntryPoint = new DhtNode({
            transportLayer: entrypointCm,
            peerDescriptor: entrypointDescriptor,
            serviceId: streamId
        })

        dhtNodes = range(numOfNodes).map((i) => new DhtNode({
            transportLayer: cms[i],
            peerDescriptor: peerDescriptors[i],
            serviceId: streamId
        }))

        graphNodes = range(numOfNodes).map((i) => createRandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtNodes[i],
            P2PTransport: cms[i],
            connectionLocker: cms[i],
            ownPeerDescriptor: peerDescriptors[i]
        }))

        entryPointRandomGraphNode = createRandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtEntryPoint,
            P2PTransport: entrypointCm,
            connectionLocker: entrypointCm,
            ownPeerDescriptor: entrypointDescriptor
        })

        await dhtEntryPoint.start()
        await dhtEntryPoint.joinDht(entrypointDescriptor)
        await Promise.all(dhtNodes.map((node) => node.start()))
    })

    afterEach(async () => {
        await dhtEntryPoint.stop()
        entryPointRandomGraphNode.stop()
        await Promise.all(dhtNodes.map((node) => node.stop()))
        await Promise.all(graphNodes.map((node) => node.stop()))
        Simulator.useFakeTimers(false)
    })

    it('happy path single peer ', async () => {

        const successListener = new SuccessListener(graphNodes[0], 1, 1)
        await entryPointRandomGraphNode.start()
        await dhtNodes[0].joinDht(entrypointDescriptor)

        await graphNodes[0].start()

        await successListener.waitForSuccess(15006)
        expect(graphNodes[0].getNearbyContactPoolIds().length).toEqual(1)
        expect(graphNodes[0].getTargetNeighborStringIds().length).toEqual(1)

    })

    it('happy path 4 peers', async () => {
        const promise = Promise.all(range(4).map((i) => {
            const successListener = new SuccessListener(graphNodes[i], 4, 4)
            return waitForEvent3<SuccessEvents>(successListener, 'success', 15009)
        }))

        entryPointRandomGraphNode.start()
        range(4).map((i) => graphNodes[i].start())
        await Promise.all(range(4).map(async (i) => {
            await dhtNodes[i].joinDht(entrypointDescriptor)
        }))

        await promise

        range(4).map((i) => {
            expect(graphNodes[i].getNearbyContactPoolIds().length).toBeGreaterThanOrEqual(4)
            expect(graphNodes[i].getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(4)
        })

        // Check bidirectionality
        const allNodes = graphNodes
        allNodes.push(entryPointRandomGraphNode)
        range(5).map((i) => {
            allNodes[i].getNearbyContactPoolIds().forEach((stringId) => {
                const neighbor = allNodes.find((peer) => {
                    return peer.getOwnStringId() === stringId
                })
                expect(neighbor!.getTargetNeighborStringIds().includes(allNodes[i].getOwnStringId())).toEqual(true)
            })
        })
    }, 10000)

    it('happy path 64 peers', async () => {

        const promise = Promise.all(graphNodes.map((node) => {

            const successListener = new SuccessListener(node, 3, 8)
            return waitForEvent3<SuccessEvents>(successListener, 'success', 15000)
        }))

        range(numOfNodes).map((i) => graphNodes[i].start())
        await Promise.all(range(numOfNodes).map(async (i) => {
            await dhtNodes[i].joinDht(entrypointDescriptor)
        }))

        await promise

        await waitForCondition(() => {
            const avg = graphNodes.reduce((acc, curr) => {
                return acc + curr.getTargetNeighborStringIds().length
            }, 0) / numOfNodes
            const avgNearest = graphNodes.reduce((acc, curr) => {
                return acc + curr.getNearbyContactPoolIds().length
            }, 0) / numOfNodes
            console.info('avgTargets: ' + avg)
            console.info('avgNearest: ' + avgNearest)
            return avg >= 3.90
        }, 60000)

        const avg = graphNodes.reduce((acc, curr) => {
            return acc + curr.getTargetNeighborStringIds().length
        }, 0) / numOfNodes

        logger.info(`AVG Number of neighbors: ${avg}`)
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getNumberOfOutgoingHandshakes() === 0)
        ))
        await wait(20000)
        let mismatchCounter = 0
        graphNodes.forEach((node) => {
            const nodeId = node.getOwnStringId()
            node.getTargetNeighborStringIds().forEach((neighborId) => {
                if (neighborId !== entryPointRandomGraphNode.getOwnStringId()) {
                    const neighbor = graphNodes.find((n) => n.getOwnStringId() === neighborId)
                    if (!neighbor!.getTargetNeighborStringIds().includes(nodeId)) {
                        logger.info('mismatching ids length: ' + neighbor!.getTargetNeighborStringIds().length)
                        mismatchCounter += 1
                    }
                }
            })
        })
        expect(mismatchCounter).toBeLessThanOrEqual(2)
    }, 90000)
})
