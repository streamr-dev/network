import { DhtAddress, LatencyType, Simulator, getNodeIdFromPeerDescriptor, getRandomRegion } from "@streamr/dht"
import { NetworkNode } from "../../src/NetworkNode"
import { createMockPeerDescriptor, createNetworkNodeWithSimulator } from "../utils/utils"
import { toStreamID, toStreamPartID } from "@streamr/protocol"
import fs from 'fs'
import { wait, waitForCondition } from "@streamr/utils"

const main = async () => {

    const numOfNodes = 150
    const streamPartId = toStreamPartID(toStreamID('teststream'), 0)
    const simulator = new Simulator(LatencyType.REAL)

    const nodes: NetworkNode[] = []

    const layer0Ep = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    const entryPoint = await createNetworkNodeWithSimulator(layer0Ep, simulator, [layer0Ep])
    await entryPoint.start()

    for (let i = 0; i < numOfNodes; i++) {
        const startTime = Date.now()
        const newNode = await createNetworkNodeWithSimulator(createMockPeerDescriptor({region: getRandomRegion()}), simulator, [layer0Ep])
        await newNode.start()
        console.log("STARTING NODE", i, newNode.getNodeId())
        await newNode.join(streamPartId, { minCount: i < 4 ? i : 4, timeout: 60000 })
        console.log("STARTED NODE", i, newNode.getNodeId(), "IN", Date.now() - startTime, "MILLISECONDS")
        nodes.push(newNode)
    }


    await wait(30000)
    const topologyFile = fs.openSync('Topology.csv', 'w')
    let ownRegionNeighborCount = 0
    // nodes.forEach((node) => {
    //     let line = `${node.getPeerDescriptor().region}_${node.getNodeId()}`
    //     for (let neighbor of node.getNeighbors(streamPartId)) {
    //         if (node.getPeerDescriptor().region === neighbor.region) {
    //             ownRegionNeighborCount += 1
    //         }
    //         line = `${line}, ${neighbor.region}_${getNodeIdFromPeerDescriptor(neighbor)}`
    //     }
    //     line = `${line}\n`
    //     console.log(line)
    //     fs.writeSync(topologyFile, line)
    // })

    console.log("AVG NUMBER OF NODES IN OWN REGION", ownRegionNeighborCount / numOfNodes)

    await Promise.all([
        entryPoint.stop(),
        ...nodes.map((node) => node.stop())
    ])
}

main().catch((err) => {
    console.error(err)
})

