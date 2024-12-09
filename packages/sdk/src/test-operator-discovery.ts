import { StreamrClient } from './StreamrClient'
import { Logger, toStreamID, toStreamPartID } from '@streamr/utils'
import { NetworkNodeType } from './Config'
import { shuffle } from 'lodash'

const STREAM_ID = toStreamID('streamr.eth/demos/video')
const NODE_ID = 'f8619ca67b65ec5310426a8715d7a6b2253c8d1b'
const HOST = 'e12f6842-d716-4379-a1a8-5051ed202d04.streamr-nodes.xyz'
const PORT = 32200

const targetStreamPartId = toStreamPartID(STREAM_ID, 0)

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
    const startTime = Date.now()
    const peerDescriptors = await streamrClient.findOperators(STREAM_ID)
    const diff1 = Date.now() - startTime
    console.log(`findOperators took ${diff1} ms`)
    for (const targetPeerDescriptor of shuffle(peerDescriptors)) {
        try {
            const startTime = Date.now()
            const operatorDescriptors = await node.discoverOperators(targetPeerDescriptor, targetStreamPartId)
            if (operatorDescriptors.length > 0) {
                const diff2 = Date.now() - startTime
                console.log(`discoverOperators took ${diff2} ms (${operatorDescriptors.length} results)`)
                console.log(`total took ${diff1 + diff2} ms`)
                process.exit(0)
            }
        } catch {
            // noop
        }
    }

})()
