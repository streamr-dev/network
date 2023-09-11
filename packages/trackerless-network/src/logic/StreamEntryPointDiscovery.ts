import { createHash } from 'crypto'
import {
    isSamePeerDescriptor,
    PeerDescriptor,
    RecursiveFindResult,
    DataEntry,
    keyFromPeerDescriptor
} from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'
import { Logger, binaryToHex, setAbortableTimeout, wait } from '@streamr/utils'
import { StreamObject } from './StreamrNode'
import { StreamPartID } from '@streamr/protocol'

export const streamPartIdToDataKey = (streamPartId: StreamPartID): Uint8Array => {
    return new Uint8Array(createHash('md5').update(streamPartId).digest())
}

const parseEntryPointData = (dataEntries: DataEntry[]): PeerDescriptor[] => {
    return dataEntries!.filter((entry) => !entry.deleted).map((entry) => Any.unpack(entry.data!, PeerDescriptor))
}

interface FindEntryPointsResult {
    joiningEmptyStream: boolean
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

interface StreamEntryPointDiscoveryConfig {
    streams: Map<string, StreamObject>
    ownPeerDescriptor: PeerDescriptor
    getEntryPointData: (key: Uint8Array) => Promise<RecursiveFindResult>
    getEntryPointDataViaNode: (key: Uint8Array, peer: PeerDescriptor) => Promise<DataEntry[]>
    storeEntryPointData: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
    deleteEntryPointData: (key: Uint8Array) => Promise<void>
    networkSplitAvoidanceLimit: number
    cacheInterval?: number
}

export class StreamEntryPointDiscovery {
    private readonly abortController: AbortController
    private readonly config: StreamEntryPointDiscoveryConfig
    private readonly servicedStreamParts: Map<StreamPartID, NodeJS.Timeout>
    private readonly cacheInterval: number

    constructor(config: StreamEntryPointDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
        this.cacheInterval = this.config.cacheInterval ?? 60000
        this.servicedStreamParts = new Map()
    }

    async discoverEntryPointsFromDht(
        streamPartId: StreamPartID,
        knownEntryPointCount: number,
        forwardingPeer?: PeerDescriptor
    ): Promise<FindEntryPointsResult> {
        if (knownEntryPointCount > 0) {
            return {
                joiningEmptyStream: false,
                entryPointsFromDht: false,
                discoveredEntryPoints: []
            }
        }
        let joiningEmptyStream = false
        const discoveredEntryPoints = await this.discoverEntryPoints(streamPartId, forwardingPeer)
        if (discoveredEntryPoints.length === 0) {
            joiningEmptyStream = true
            discoveredEntryPoints.push(this.config.ownPeerDescriptor)
        }
        // eslint-disable-next-line max-len
        logger.error(`${keyFromPeerDescriptor(this.config.ownPeerDescriptor)} discovered stream entry points ${discoveredEntryPoints.map((peer) => keyFromPeerDescriptor(peer))}`)
        return {
            joiningEmptyStream,
            discoveredEntryPoints,
            entryPointsFromDht: true
        }
    }

    private async discoverEntryPoints(streamPartId: StreamPartID, forwardingPeer?: PeerDescriptor): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(streamPartId)
        return forwardingPeer ? 
            this.queryEntryPointsViaPeer(dataKey, forwardingPeer) : await this.queryEntrypoints(dataKey)
    }

    private async queryEntrypoints(key: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Finding data from dht peer ${this.config.ownPeerDescriptor!.nodeName}`)
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

    private async queryEntryPointsViaPeer(key: Uint8Array, peer: PeerDescriptor): Promise<PeerDescriptor[]> {
        logger.trace(`Finding data via peer ${this.config.ownPeerDescriptor!.nodeName}`)
        try {
            const results = await this.config.getEntryPointDataViaNode(key, peer)
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
        joiningEmptyStream: boolean,
        entryPointsFromDht: boolean,
        currentEntrypointCount: number
    ): Promise<void> {
        if (joiningEmptyStream) {
            await this.storeSelfAsEntryPoint(streamPartId)
            setImmediate(() => this.avoidNetworkSplit(streamPartId))
        } else if (entryPointsFromDht && currentEntrypointCount < ENTRYPOINT_STORE_LIMIT) {
            try {
                await this.storeSelfAsEntryPoint(streamPartId)
            } catch (err) {
                logger.trace(`Failed to store self as entrypoint on stream `)
            }
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
        logger.error(`${keyFromPeerDescriptor(this.config.ownPeerDescriptor)} avoiding network split`)
        await exponentialRunOff(async () => {
            if (this.config.streams.has(streamPartId)) {
                const stream = this.config.streams.get(streamPartId)
                const rediscoveredEntrypoints = await this.discoverEntryPoints(streamPartId)
                // eslint-disable-next-line max-len
                logger.error(`${keyFromPeerDescriptor(this.config.ownPeerDescriptor)} avoid network split found entry points ${rediscoveredEntrypoints.map((peer) => keyFromPeerDescriptor(peer))}`)
                await stream!.layer1!.joinDht(rediscoveredEntrypoints, false, false)
                // eslint-disable-next-line max-len
                logger.error(`${keyFromPeerDescriptor(this.config.ownPeerDescriptor)} avoid network split join completed, bucket: ${stream!.layer1!.getKBucketPeers().map((peer) => binaryToHex(peer.kademliaId))}, neighbors: ${stream!.layer2.getTargetNeighborIds()}`)
                if (stream!.layer1!.getBucketSize() < this.config.networkSplitAvoidanceLimit) {
                    throw new Error(`Network split is still possible`)
                }
            }
        }, 'avoid network split', this.abortController.signal)
        logger.trace(`Network split avoided`)
    }

    removeSelfAsEntryPoint(streamPartId: StreamPartID): void {
        if (this.servicedStreamParts.has(streamPartId)) {
            setAbortableTimeout(() => this.config.deleteEntryPointData(streamPartIdToDataKey(streamPartId)), 0, this.abortController.signal)
            clearTimeout(this.servicedStreamParts.get(streamPartId)!)
            this.servicedStreamParts.delete(streamPartId)
        }
    }

    async destroy(): Promise<void> {
        this.servicedStreamParts.forEach((_, streamPartId) => this.removeSelfAsEntryPoint(streamPartId))
        this.servicedStreamParts.clear()
        this.abortController.abort()
    }

}
