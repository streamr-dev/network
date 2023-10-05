import { createHash } from 'crypto'
import {
    isSamePeerDescriptor,
    PeerDescriptor,
    RecursiveFindResult,
    DataEntry
} from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'
import { Logger, setAbortableTimeout, wait } from '@streamr/utils'
import { StreamObject } from './StreamrNode'
import { StreamPartID } from '@streamr/protocol'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'

export const streamPartIdToDataKey = (streamPartId: StreamPartID): Uint8Array => {
    return new Uint8Array(createHash('md5').update(streamPartId).digest())
}

const parseEntryPointData = (dataEntries: DataEntry[]): PeerDescriptor[] => {
    return dataEntries.filter((entry) => !entry.deleted).map((entry) => Any.unpack(entry.data!, PeerDescriptor))
}

interface FindEntryPointsResult {
    entryPointsFromDht: boolean
    discoveredEntryPoints: PeerDescriptor[]
}

const exponentialRunOff = async (
    task: () => Promise<void>,
    description: string,
    abortSignal: AbortSignal,
    baseDelay = 500,
    maxAttempts = 6
): Promise<void> => {
    for (let i = 1; i <= maxAttempts; i++) {
        if (abortSignal.aborted) {
            return
        }
        const factor = 2 ** i
        const delay = baseDelay * factor
        try {
            await task()
        } catch (e: any) {
            logger.trace(`${description} failed, retrying in ${delay} ms`)
        }
        try { // Abort controller throws unexpected errors in destroy?
            await wait(delay, abortSignal)
        } catch (err) {
            logger.trace(`${err}`)
        }
    }
}

const logger = new Logger(module)

const ENTRYPOINT_STORE_LIMIT = 8
export const NETWORK_SPLIT_AVOIDANCE_LIMIT = 4

interface StreamEntryPointDiscoveryConfig {
    streams: Map<string, StreamObject>
    ownPeerDescriptor: PeerDescriptor
    getEntryPointData: (key: Uint8Array) => Promise<RecursiveFindResult>
    getEntryPointDataViaNode: (key: Uint8Array, node: PeerDescriptor) => Promise<DataEntry[]>
    storeEntryPointData: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
    deleteEntryPointData: (key: Uint8Array) => Promise<void>
    cacheInterval?: number
}

export class StreamEntryPointDiscovery {
    private readonly abortController: AbortController
    private readonly config: StreamEntryPointDiscoveryConfig
    private readonly servicedStreamParts: Map<StreamPartID, NodeJS.Timeout>
    private readonly cacheInterval: number
    private readonly networkSplitAvoidedNodes: Map<StreamPartID, Set<NodeID>> = new Map()

    constructor(config: StreamEntryPointDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
        this.cacheInterval = this.config.cacheInterval ?? 60000
        this.servicedStreamParts = new Map()
    }

    async discoverEntryPointsFromDht(
        streamPartId: StreamPartID,
        knownEntryPointCount: number,
        forwardingNode?: PeerDescriptor
    ): Promise<FindEntryPointsResult> {
        if (knownEntryPointCount > 0) {
            return {
                entryPointsFromDht: false,
                discoveredEntryPoints: []
            }
        }
        const discoveredEntryPoints = await this.discoverEntryPoints(streamPartId, forwardingNode)
        if (discoveredEntryPoints.length === 0) {
            discoveredEntryPoints.push(this.config.ownPeerDescriptor)
        }
        return {
            discoveredEntryPoints,
            entryPointsFromDht: true
        }
    }

    private async discoverEntryPoints(streamPartId: StreamPartID, forwardingNode?: PeerDescriptor): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(streamPartId)
        let discoveredEntryPoints = forwardingNode ? 
            await this.queryEntryPointsViaNode(dataKey, forwardingNode) : await this.queryEntrypoints(dataKey)
    
        if (this.networkSplitAvoidedNodes.has(streamPartId)) {
            const filtered = discoveredEntryPoints.filter((node) => 
                !this.networkSplitAvoidedNodes.get(streamPartId)!.has(getNodeIdFromPeerDescriptor(node)))
            // If all discovered entry points have previously beed detected as offline, try again
            if (filtered.length > 0) {
                discoveredEntryPoints = filtered
            }
        }
        return discoveredEntryPoints
    }

    private async queryEntrypoints(key: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Finding data from dht node ${this.config.ownPeerDescriptor.nodeName}`)
        try {
            const results = await this.config.getEntryPointData(key)
            if (results.dataEntries) {
                return parseEntryPointData(results.dataEntries)
            } else {
                return []
            }
        } catch (err) {
            return []
        }
    }

    private async queryEntryPointsViaNode(key: Uint8Array, node: PeerDescriptor): Promise<PeerDescriptor[]> {
        logger.trace(`Finding data via node ${this.config.ownPeerDescriptor.nodeName}`)
        try {
            const results = await this.config.getEntryPointDataViaNode(key, node)
            if (results) {
                return parseEntryPointData(results)
            } else {
                return []
            }
        } catch (err) {
            return []
        }
    }

    async storeSelfAsEntryPointIfNecessary(
        streamPartId: StreamPartID,
        entryPointsFromDht: boolean,
        currentEntrypointCount: number
    ): Promise<void> {
        if (!this.config.streams.has(streamPartId) || !entryPointsFromDht) {
            return
        }
        if (this.config.streams.get(streamPartId)!.layer1!.getBucketSize() < NETWORK_SPLIT_AVOIDANCE_LIMIT) {
            await this.storeSelfAsEntryPoint(streamPartId)
            setImmediate(() => this.avoidNetworkSplit(streamPartId))
        } else if (currentEntrypointCount < ENTRYPOINT_STORE_LIMIT) {
            await this.storeSelfAsEntryPoint(streamPartId)
        }
    }

    private async storeSelfAsEntryPoint(streamPartId: StreamPartID): Promise<void> {
        const ownPeerDescriptor = this.config.ownPeerDescriptor
        const dataToStore = Any.pack(ownPeerDescriptor, PeerDescriptor)
        try {
            await this.config.storeEntryPointData(streamPartIdToDataKey(streamPartId), dataToStore)
            this.keepSelfAsEntryPoint(streamPartId)
        } catch (err) {
            logger.warn(`Failed to store self as entrypoint for ${streamPartId}`)
        }
    }

    private keepSelfAsEntryPoint(streamPartId: StreamPartID): void {
        if (!this.config.streams.has(streamPartId) || this.servicedStreamParts.has(streamPartId)) {
            return
        }
        this.servicedStreamParts.set(streamPartId, setTimeout(async () => {
            if (!this.config.streams.has(streamPartId)) {
                this.servicedStreamParts.delete(streamPartId)
                return
            }
            logger.trace(`Attempting to keep self as entrypoint for ${streamPartId}`)
            try {
                const discovered = await this.discoverEntryPoints(streamPartId)
                if (discovered.length < ENTRYPOINT_STORE_LIMIT 
                    || discovered.some((peerDescriptor) => isSamePeerDescriptor(peerDescriptor, this.config.ownPeerDescriptor))) {
                    await this.storeSelfAsEntryPoint(streamPartId)
                    this.servicedStreamParts.delete(streamPartId)
                    this.keepSelfAsEntryPoint(streamPartId)
                } else {
                    this.servicedStreamParts.delete(streamPartId)
                }
            } catch (err) {
                logger.debug(`Failed to keep self as entrypoint for ${streamPartId}`)
            }
        }, this.cacheInterval))
    }

    private async avoidNetworkSplit(streamPartId: StreamPartID): Promise<void> {
        await exponentialRunOff(async () => {
            if (this.config.streams.has(streamPartId)) {
                const stream = this.config.streams.get(streamPartId)!
                const rediscoveredEntrypoints = await this.discoverEntryPoints(streamPartId)
                await stream.layer1!.joinDht(rediscoveredEntrypoints, false, false)
                if (stream.layer1!.getBucketSize() < NETWORK_SPLIT_AVOIDANCE_LIMIT) {
                    // Filter out nodes that are not in the k-bucket, assumed to be offline
                    const nodesToAvoid = rediscoveredEntrypoints.filter((peer) => !stream.layer1!.getKBucketPeers().includes(peer))
                    this.addAvoidedNodes(streamPartId, nodesToAvoid)
                    throw new Error(`Network split is still possible`)
                }
            }
        }, 'avoid network split', this.abortController.signal)
        this.networkSplitAvoidedNodes.delete(streamPartId)
        logger.trace(`Network split avoided`)
    }

    private addAvoidedNodes(streamPartId: StreamPartID, nodesToAvoid: PeerDescriptor[]): void {
        if (!this.networkSplitAvoidedNodes.has(streamPartId)) {
            this.networkSplitAvoidedNodes.set(streamPartId, new Set())
        }
        nodesToAvoid.forEach((node) => this.networkSplitAvoidedNodes.get(streamPartId)!.add(getNodeIdFromPeerDescriptor(node)))
    }

    removeSelfAsEntryPoint(streamPartId: StreamPartID): void {
        if (this.servicedStreamParts.has(streamPartId)) {
            setAbortableTimeout(() => this.config.deleteEntryPointData(streamPartIdToDataKey(streamPartId)), 0, this.abortController.signal)
            clearTimeout(this.servicedStreamParts.get(streamPartId))
            this.servicedStreamParts.delete(streamPartId)
        }
    }

    async destroy(): Promise<void> {
        this.servicedStreamParts.forEach((_, streamPartId) => this.removeSelfAsEntryPoint(streamPartId))
        this.servicedStreamParts.clear()
        this.abortController.abort()
    }

}
