/* eslint-disable no-console */
import { hexToBinary, binaryToHex } from '@streamr/utils'
import { DhtNode, NodeType, DhtAddress } from '@streamr/dht'

// 63876bf3c80c636dec99b016709d0573caaf161c
// 60e56386b9276f64c820a4a8704e54ad2b5e481c
const findNode = async () => {
    const nodeId = process.argv[2]
    if (!nodeId) {
        console.error('Please provide a node ID as the first argument')
        process.exit(1)
    }
    console.log('Finding node', nodeId)
    const entryPoints = [{
        nodeId: hexToBinary('e5f87a7ee99b3c91e7b795b70f87ef8ba5497596'),
        type: NodeType.NODEJS,
        websocket: {
            host: 'polygon-entrypoint-3.streamr.network',
            port: 40402,
            tls: true
        }
    },
    {
        nodeId: hexToBinary('6f5b53812fd9cc07f225a0b3a6aa5b96672e852e'),
        type: NodeType.NODEJS,
        websocket: {
            host: 'polygon-entrypoint-4.streamr.network',
            port: 40402,
            tls: true
        }
    }]
    const node = new DhtNode({
        entryPoints,
        iceServers: [
            {
                'url': 'stun:stun.streamr.network',
                'port': 5349
            },
            {
                'url': 'turn:turn.streamr.network',
                'port': 5349,
                'username': 'BrubeckTurn1',
                'password': 'MIlbgtMw4nhpmbgqRrht1Q=='
            },
            {
                'url': 'turn:turn.streamr.network',
                'port': 5349,
                'username': 'BrubeckTurn1',
                'password': 'MIlbgtMw4nhpmbgqRrht1Q==',
                'tcp': true
            }
        ]
    })
    await node.start()
    await node.joinDht(entryPoints)
    const result = await node.findClosestNodesFromDht(nodeId as DhtAddress)
    const wasFound = result.some((node) => binaryToHex(node.nodeId) === nodeId)
    console.log(`Searched node ${wasFound ? 'was found' : 'was not found'}`)
    if (wasFound) {
        console.log('FOUND NODE:', result.find((node) => binaryToHex(node.nodeId) === nodeId))
    }
    await node.stop()
}

findNode()
