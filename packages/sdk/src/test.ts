import { StreamrClient } from './StreamrClient'
import { Logger, toStreamID, toStreamPartID } from '@streamr/utils'
import { NetworkNodeType, NetworkPeerDescriptor } from './Config'
import { ProxyDirection } from '@streamr/trackerless-network'
import { shuffle } from 'lodash'

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

async function findEntryPoint(streamrClient: StreamrClient): Promise<{ operatorDescriptors: NetworkPeerDescriptor[], timeTaken: number }> {
    const node = streamrClient.getNode()
    const startTime = Date.now()
    const peerDescriptors = await streamrClient.findOperators(STREAM_ID)
    const diff1 = Date.now() - startTime
    //console.log(`findOperators took ${diff1} ms`)
    for (const targetPeerDescriptor of shuffle(peerDescriptors)) {
        try {
            const startTime = Date.now()
            const operatorDescriptors = await node.discoverOperators(targetPeerDescriptor, targetStreamPartId)
            if (operatorDescriptors.length > 0) {
                const diff2 = Date.now() - startTime
                //console.log(`discoverOperators took ${diff2} ms (${operatorDescriptors.length} results)`)
                return {
                    operatorDescriptors,
                    timeTaken: diff1 + diff2
                }
            }
        } catch {
            // noop
        }
    }
    throw new Error('Unable to find any operator entrypoints')
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
    let additionalTimeTaken = 0
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
        const { operatorDescriptors, timeTaken } = await findEntryPoint(streamrClient)
        const startTime = Date.now()
        await streamrClient.setProxies(targetStreamPartId, operatorDescriptors, ProxyDirection.SUBSCRIBE)
        const diff = Date.now() - startTime
        additionalTimeTaken += timeTaken + diff
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
            console.info(`Received 1st message in ${diff + additionalTimeTaken} ms (runMode=${runMode})`)
            //logger.info(`Received 1st message in ${diff} ms`)
            process.exit(0)
        })
    ])
})()
