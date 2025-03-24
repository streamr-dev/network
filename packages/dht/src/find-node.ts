import { hexToBinary, binaryToHex, wait } from "@streamr/utils"
import { DhtNode } from "./dht/DhtNode"
import { NodeType, RecursiveOperation } from "../generated/packages/dht/protos/DhtRpc"
import { DhtAddress } from "./identifiers"

// 63876bf3c80c636dec99b016709d0573caaf161c
// 60e56386b9276f64c820a4a8704e54ad2b5e481c
const findNode = async () => {
    const nodeId = '279da219f5f9a1224e320f6df3de86a3ad8140ee'
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
    // await wait(20000)
    // const result = await node.findClosestNodesFromDht(nodeId as DhtAddress)
    // console.log("FOUND NODES:", result)
    // console.log("FOUND NODE IDS:", result.map((node) => binaryToHex(node.nodeId)))
    // const wasFound = result.some((node) => binaryToHex(node.nodeId) === nodeId)
    // console.log("Searched node with id", nodeId, `${wasFound ? 'was found' : 'was not found'}`)
    const result = await node.fetchDataFromDht(nodeId as DhtAddress)
    console.log(result)
    await node.stop()
}
findNode()