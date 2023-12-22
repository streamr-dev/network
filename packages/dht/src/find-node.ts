import { hexToBinary, binaryToHex } from "@streamr/utils"
import { DhtNode } from "./dht/DhtNode"
import { NodeType, RecursiveOperation } from "./proto/packages/dht/protos/DhtRpc"
import { DhtAddress } from "./identifiers"

const findNode = async () => {
    const nodeId = 'fe4dd97dcf7c4eb98f443da42bbd2a77'
    const entryPoints = [{
        nodeId: hexToBinary("93684a8ad560fc6e8fb02bf22af64103"),
        type: NodeType.NODEJS,
        websocket: {
            host: "polygon-entrypoint-1.streamr.network",
            port: 40402,
            tls: true
        }
    },
    {
        nodeId: hexToBinary("6d5787d4e9e72c0f59f97df0afa53921"),
        type: NodeType.NODEJS,
        websocket: {
            host: "polygon-entrypoint-2.streamr.network",
            port: 40402,
            tls: true
        }
    }]
    const node = new DhtNode({
        entryPoints
    })
    await node.start()
    await node.joinDht(entryPoints) 
    const result = await node.executeRecursiveOperation(nodeId as DhtAddress, RecursiveOperation.FIND_NODE)
    console.log("FOUND NODES:", result.closestNodes)
    const wasFound = result.closestNodes.some((node) => binaryToHex(node.nodeId) === nodeId)
    console.log("Searched node with id", nodeId, `${wasFound ? 'was found' : 'was not found'}`)
    await node.stop()
}

findNode()