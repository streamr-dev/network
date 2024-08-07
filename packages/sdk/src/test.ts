import { StreamrClient } from './StreamrClient'
import { Logger, toStreamID, toStreamPartID, wait } from '@streamr/utils'
import { NetworkNodeType, StreamrClientConfig, StrictStreamrClientConfig } from './Config'
import { ProxyDirection } from '@streamr/trackerless-network'

enum RunMode {
    NORMAL,
    STREAM_ENTRYPOINT,
    PROXY
}

const logger = new Logger(module)

const RUN_MODE = RunMode.NORMAL
const STREAM_ID = toStreamID('streamr.eth/demos/video')
const NODE_ID = 'f8619ca67b65ec5310426a8715345afd6c0bac1c'
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
    let streamrClient: StreamrClient
    if (RUN_MODE === RunMode.NORMAL) {
        streamrClient = new StreamrClient({
            network: {
                controlLayer: {
                    websocketPortRange: null
                }
            }
        })
    } else if (RUN_MODE === RunMode.PROXY) {
        streamrClient = new StreamrClient({
            network: {
                controlLayer: {
                    websocketPortRange: null
                }
            }
        })
        await streamrClient.setProxies(targetStreamPartId, [targetPeerDescriptor], ProxyDirection.SUBSCRIBE)
    } else if (RUN_MODE === RunMode.STREAM_ENTRYPOINT) {
        streamrClient = new StreamrClient({
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
    } else {
        throw new Error('unknown run mode')
    }
    const startTime = Date.now()
    await streamrClient.subscribe(targetStreamPartId, async (_message) => {
        const diff = Date.now() - startTime
        //console.info(`Received 1st message in ${diff} ms`)
        logger.info(`Received 1st message in ${diff} ms`)
        process.exit(0)
    })
})()
