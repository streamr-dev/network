/* eslint-disable no-console */
import { hexToBinary, wait } from '@streamr/utils'
import { NodeType } from '@streamr/dht'
import { createNetworkNode } from '@streamr/trackerless-network'

const main = async () => {
    const nodeId = process.argv[2]
    if (!nodeId) {
        console.error('Please provide a node ID as the first argument')
        process.exit(1)
    }
    console.log('Fetching node info from', nodeId)
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
    const node = createNetworkNode({
        layer0: {
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
        }
    })
    await node.start()
    await wait(2000) // Wait for more connections in the DHT

    // As we only know the ID of the node we cannot connect directly to the node's WS server if it has one.
    const result = await node.fetchNodeInfo({
        nodeId: hexToBinary(nodeId),
        type: NodeType.BROWSER       
    })

    console.log('PeerDescriptor:', result.peerDescriptor)
    console.log('Version:', result.version)
    console.log('Number of connections:', result.controlLayer.connections.length)
    console.log('Number of coontrol layer neighbors:', result.controlLayer.neighbors.length)
    console.log('Number of stream partitions:', result.streamPartitions.length)
    console.log('Stream partitions:', result.streamPartitions.map((streamPartInfo) => streamPartInfo.id))

    await node.stop()
}

main()
