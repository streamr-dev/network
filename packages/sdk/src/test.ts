import { StreamrClient } from './StreamrClient'
import { Logger, toStreamID, toStreamPartID } from '@streamr/utils'
import { NetworkNodeType } from './Config'
import { ProxyDirection } from '@streamr/trackerless-network'

enum RunMode {
    NORMAL = 'normal',
    STREAM_ENTRYPOINT = 'entrypoint',
    PROXY = 'proxy'
}

const logger = new Logger(module)

const STREAM_ID = toStreamID('streamr.eth/demos/video')
const NODE_ID = 'f8619ca67b65ec5310426a8715d7a6b2253c8d1b'
const HOST = 'e12f6842-d716-4379-a1a8-5051ed202d04.streamr-nodes.xyz'
const PORT = 32200

const targetStreamPartId = toStreamPartID(STREAM_ID, 0)
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
    const runModeString = process.argv[2]
    let runMode: RunMode
    if (!runModeString) {
        throw new Error('run mode must be provided')
    }
    if (runModeString === 'normal') {
        runMode = RunMode.NORMAL
    } else if (runModeString === 'entrypoint') {
        runMode = RunMode.STREAM_ENTRYPOINT
    } else if (runModeString === 'proxy') {
        runMode = RunMode.PROXY
    } else {
        throw new Error('unknown run mode')
    }

    let streamrClient: StreamrClient
    if (runMode === RunMode.NORMAL) {
        streamrClient = new StreamrClient({
            metrics: false,
            network: {
                controlLayer: {
                    websocketPortRange: null
                }
            }
        })
    } else if (runMode === RunMode.PROXY) {
        streamrClient = new StreamrClient({
            metrics: false,
            network: {
                controlLayer: {
                    websocketPortRange: null
                }
            }
        })
        await streamrClient.setProxies(targetStreamPartId, [targetPeerDescriptor], ProxyDirection.SUBSCRIBE)
    } else {
        streamrClient = new StreamrClient({
            metrics: false,
            network: {
                controlLayer: {
                    websocketPortRange: null,
                    entryPoints: [targetPeerDescriptor],
                    entryPointDiscovery: { // TODO: disable or not?
                        enabled: false
                    }
                }
            }
        })
        await streamrClient.setStreamPartitionEntryPoints(targetStreamPartId, [targetPeerDescriptor])
    }

    const startTime = Date.now()
    await Promise.all([
        streamrClient.getStream(STREAM_ID), // start pre-populating cache while waiting for 1st message to arrive
        streamrClient.subscribe(targetStreamPartId, async (_message) => {
            const diff = Date.now() - startTime
            console.info(`Received 1st message in ${diff} ms (runMode=${runMode})`)
            //logger.info(`Received 1st message in ${diff} ms`)
            process.exit(0)
        })
    ])
})()
