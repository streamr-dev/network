import { hexToBinary, binaryToHex, wait } from "@streamr/utils"
import { DhtNode, DhtAddress, NodeType } from "@streamr/dht"
import { NetworkNode } from "./NetworkNode"
import { NetworkStack } from "./NetworkStack"

const nodeId = 'f3724dcc79ad77fe5aabe3fcf679c44f0612101b'

const main = async () => {
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
    const stack = new NetworkStack({
        layer0: {
            entryPoints,
            iceServers: [
                {
                    "url": "stun:stun.streamr.network",
                    "port": 5349
                },
                {
                    "url": "turn:turn.streamr.network",
                    "port": 5349,
                    "username": "BrubeckTurn1",
                    "password": "MIlbgtMw4nhpmbgqRrht1Q=="
                },
                {
                    "url": "turn:turn.streamr.network",
                    "port": 5349,
                    "username": "BrubeckTurn1",
                    "password": "MIlbgtMw4nhpmbgqRrht1Q==",
                    "tcp": true
                }
            ]
        }
    })
    await stack.start()
    const node = new NetworkNode(stack)
    const result = await node.fetchNodeInfo({
        nodeId: hexToBinary(nodeId),
        type: NodeType.BROWSER       
    })
    console.log(result)
}

main()
