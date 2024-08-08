import { StreamrClient } from './StreamrClient'
import { Logger, toStreamID, toStreamPartID } from '@streamr/utils'
import { NetworkNodeType } from './Config'

const STREAM_ID = toStreamID('streamr.eth/demos/video')
const NODE_ID = 'f8619ca67b65ec5310426a871535f9e61880e91b'
const HOST = 'e12f6842-d716-4379-a1a8-5051ed202d04.streamr-nodes.xyz'
const PORT = 32200

const targetStreamPartId = toStreamPartID(STREAM_ID, 4)
const targetPeerDescriptor = {
    nodeId: NODE_ID,
    type: NetworkNodeType.NODEJS,
    websocket: {
        host: HOST,
        port: PORT,
        tls: true
    }
}

const streamrClient = new StreamrClient({
    metrics: false,
    network: {
        controlLayer: {
            websocketPortRange: null
        }
    }
})

;(async () => {
    const node = streamrClient.getNode()
    for (let i = 0; i < 8; ++i) {
        const startTime = Date.now()
        const peerDescriptors = await node.discoverOperators(targetPeerDescriptor, toStreamPartID(STREAM_ID, i))
        console.log('Discovered', JSON.stringify({
            peerDescriptors,
            elapsedTime: Date.now() - startTime
        }))
    }
    process.exit(0)
})()
