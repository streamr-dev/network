import {
    DataEntry,
    PeerDescriptor,
    areEqualPeerDescriptors
} from '@streamr/dht'
import { StreamPartID } from '@streamr/protocol'
import { Logger, scheduleAtInterval, wait } from '@streamr/utils'
import { createHash } from 'crypto'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'
import { Any } from '../proto/google/protobuf/any'
import { Layer1Node } from './Layer1Node'

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

const ENTRYPOINT_STORE_LIMIT = 20
export const NETWORK_SPLIT_AVOIDANCE_LIMIT = 4

interface EntryPointDiscoveryConfig {
    streamPartId: StreamPartID
    localPeerDescriptor: PeerDescriptor
    layer1Node: Layer1Node
    getEntryPointData: (key: Uint8Array) => Promise<DataEntry[]>
    storeEntryPointData: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
    deleteEntryPointData: (key: Uint8Array) => Promise<void>
    storeInterval?: number
}

export class EntryPointDiscovery {
    private readonly abortController: AbortController
    private readonly config: EntryPointDiscoveryConfig
    private readonly storeInterval: number
    private readonly networkSplitAvoidedNodes: Set<NodeID> = new Set()

    constructor(config: EntryPointDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
        this.storeInterval = this.config.storeInterval ?? 60000
    }

    async discoverEntryPointsFromDht(
        knownEntryPointCount: number
    ): Promise<FindEntryPointsResult> {
        if (knownEntryPointCount > 0) {
            return {
                entryPointsFromDht: false,
                discoveredEntryPoints: []
            }
        }
        const discoveredEntryPoints = await this.discoverEntryPoints()
        if (discoveredEntryPoints.length === 0) {
            discoveredEntryPoints.push(this.config.localPeerDescriptor)
        }
        return {
            discoveredEntryPoints,
            entryPointsFromDht: true
        }
    }

    private async discoverEntryPoints(): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(this.config.streamPartId)
        const discoveredEntryPoints = await this.queryEntrypoints(dataKey)
        const filtered = discoveredEntryPoints.filter((node) => 
            !this.networkSplitAvoidedNodes.has(getNodeIdFromPeerDescriptor(node)))
        // If all discovered entry points have previously been detected as offline, try again
        if (filtered.length > 0) {
            return filtered
        } else {
            return discoveredEntryPoints
        }
    }

    private async queryEntrypoints(key: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Finding data from dht node ${getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)}`)
        try {
            const result = await this.config.getEntryPointData(key)
            return parseEntryPointData(result)
        } catch (err) {
            return []
        }
    }

    async storeSelfAsEntryPointIfNecessary(currentEntrypointCount: number): Promise<void> {
        if (this.abortController.signal.aborted) {
            return
        }
        const possibleNetworkSplitDetected = this.config.layer1Node.getBucketSize() < NETWORK_SPLIT_AVOIDANCE_LIMIT
        if ((currentEntrypointCount < ENTRYPOINT_STORE_LIMIT) || possibleNetworkSplitDetected) {
            await this.storeSelfAsEntryPoint()
            await this.keepSelfAsEntryPoint()
        }
        if (possibleNetworkSplitDetected) {
            setImmediate(() => this.avoidNetworkSplit())
        }
    }

    private async storeSelfAsEntryPoint(): Promise<void> {
        const localPeerDescriptor = this.config.localPeerDescriptor
        const dataToStore = Any.pack(localPeerDescriptor, PeerDescriptor)
        try {
            await this.config.storeEntryPointData(streamPartIdToDataKey(this.config.streamPartId), dataToStore)
        } catch (err) {
            logger.warn(`Failed to store self as entrypoint for ${this.config.streamPartId}`)
        }
    }

    private async keepSelfAsEntryPoint(): Promise<void> {
        await scheduleAtInterval(async () => {
            logger.trace(`Attempting to keep self as entrypoint for ${this.config.streamPartId}`)
            try {
                const discovered = await this.discoverEntryPoints()
                if (discovered.length < ENTRYPOINT_STORE_LIMIT 
                    || discovered.some((peerDescriptor) => areEqualPeerDescriptors(peerDescriptor, this.config.localPeerDescriptor))) {
                    await this.storeSelfAsEntryPoint()
                }
            } catch (err) {
                logger.debug(`Failed to keep self as entrypoint for ${this.config.streamPartId}`)
            }
        }, this.storeInterval, false, this.abortController.signal)
    }

    private async avoidNetworkSplit(): Promise<void> {
        await exponentialRunOff(async () => {
            const rediscoveredEntrypoints = await this.discoverEntryPoints()
            await this.config.layer1Node.joinDht(rediscoveredEntrypoints, false, false)
            if (this.config.layer1Node!.getBucketSize() < NETWORK_SPLIT_AVOIDANCE_LIMIT) {
                // Filter out nodes that are not in the k-bucket, assumed to be offline
                const nodesToAvoid = rediscoveredEntrypoints
                    .filter((peer) => !this.config.layer1Node!.getKBucketPeers().includes(peer))
                    .map((peer) => getNodeIdFromPeerDescriptor(peer))
                nodesToAvoid.forEach((node) => this.networkSplitAvoidedNodes.add(node))
                throw new Error(`Network split is still possible`)
            }
        }, 'avoid network split', this.abortController.signal)
        this.networkSplitAvoidedNodes.clear()
        logger.trace(`Network split avoided`)
    }

    async destroy(): Promise<void> {
        this.abortController.abort()
        await this.config.deleteEntryPointData(streamPartIdToDataKey(this.config.streamPartId))
    }
}
