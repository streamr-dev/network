import { StreamrClient } from './StreamrClient'
import { toStreamID, toStreamPartID } from '@streamr/utils'
import { NetworkNodeType } from './Config'
import { ProxyDirection } from '@streamr/trackerless-network'

const NODE_ID = 'f8619ca67b65ec5310426a8715345afd6c0bac1c'
const HOST = 'e12f6842-d716-4379-a1a8-5051ed202d04.streamr-nodes.xyz'
const PORT = 32200

const targetStreamPartId = toStreamPartID(toStreamID('streamr.eth/demos/video'), 0)

const targetPeerDescriptor = {
    nodeId: NODE_ID,
    type: NetworkNodeType.NODEJS,
    websocket: {
        host: HOST,
        port: PORT,
        tls: true
    }
}

;(async () => {
    const streamrClient = new StreamrClient({
        network: {
            controlLayer: {
                websocketPortRange: null,
                entryPoints: [targetPeerDescriptor]
            }
        }
    })
    await streamrClient.setStreamPartitionEntryPoints(targetStreamPartId, [targetPeerDescriptor])
    //await streamrClient.setProxies(targetStreamPartId, [targetPeerDescriptor], ProxyDirection.SUBSCRIBE)
    const startTime = Date.now()
    await streamrClient.subscribe(targetStreamPartId, async (_message) => {
        const diff = Date.now() - startTime
        console.info(`Received 1st message in ${diff} ms`)
        process.exit(0)
    })
})()
