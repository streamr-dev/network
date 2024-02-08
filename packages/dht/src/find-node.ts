import { hexToBinary, binaryToHex, wait } from "@streamr/utils"
import { DhtNode } from "./dht/DhtNode"
import { NodeType, RecursiveOperation } from "./proto/packages/dht/protos/DhtRpc"
import { DhtAddress } from "./identifiers"

// 63876bf3c80c636dec99b016709d0573caaf161c
// 60e56386b9276f64c820a4a8704e54ad2b5e481c
const findNode = async () => {
    const nodeId = '60e56386b9276f64c820a4a8704e54ad2b5e481c'
    const entryPoints = [{
        nodeId: hexToBinary("e5f87a7ee99b3c91e7b795b70f87ef8ba5497596"),
        type: NodeType.NODEJS,
        websocket: {
            host: "polygon-entrypoint-3.streamr.network",
            port: 40402,
            tls: true
        }
    },
    {
        nodeId: hexToBinary("6f5b53812fd9cc07f225a0b3a6aa5b96672e852e"),
        type: NodeType.NODEJS,
        websocket: {
            host: "polygon-entrypoint-4.streamr.network",
            port: 40402,
            tls: true
        }
    }]
    const node = new DhtNode({
        entryPoints
    })
    await node.start()
    await node.joinDht(entryPoints)
    await wait(60000)
    const result = await node.executeRecursiveOperation(nodeId as DhtAddress, RecursiveOperation.FIND_NODE)
    console.log("FOUND NODES:", result.closestNodes)
    console.log("FOUND NODE IDS:", result.closestNodes.map((node) => binaryToHex(node.nodeId)))
    const wasFound = result.closestNodes.some((node) => binaryToHex(node.nodeId) === nodeId)
    console.log("Searched node with id", nodeId, `${wasFound ? 'was found' : 'was not found'}`)
    await node.stop()
}
findNode()