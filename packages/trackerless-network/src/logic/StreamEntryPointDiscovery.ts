import { createHash } from 'crypto'
import {
    isSamePeerDescriptor,
    PeerDescriptor,
    PeerID,
    Contact,
    SortedContactList,
    RecursiveFindResult,
    DataEntry
} from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'
import { Logger, wait } from '@streamr/utils'
import { StreamObject } from './StreamrNode'

export const streamPartIdToDataKey = (streamPartId: string): Uint8Array => {
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
    getEntryPointDataViaPeer: (key: Uint8Array, peer: PeerDescriptor) => Promise<DataEntry[]>
    storeEntryPointData: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
    deleteEntryPointData: (key: Uint8Array) => Promise<void>
    cacheInterval?: number
}

export class StreamEntryPointDiscovery {
    private readonly abortController: AbortController
    private readonly config: StreamEntryPointDiscoveryConfig
    private readonly servicedStreams: Map<string, NodeJS.Timeout>
    private readonly cacheInterval: number
    private destroyed = false

    constructor(config: StreamEntryPointDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
        this.cacheInterval = this.config.cacheInterval || 60000
        this.servicedStreams = new Map()
    }

    async discoverEntryPointsFromDht(
        streamPartID: string,
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
        const discoveredEntryPoints = await this.discoverEntryPoints(streamPartID, forwardingPeer)
        if (discoveredEntryPoints.length === 0) {
            joiningEmptyStream = true
            discoveredEntryPoints.push(this.config.ownPeerDescriptor)
        }
        return {
            joiningEmptyStream,
            discoveredEntryPoints,
            entryPointsFromDht: true
        }
    }

    private async discoverEntryPoints(streamPartId: string, forwardingPeer?: PeerDescriptor): Promise<PeerDescriptor[]> {
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
            const results = await this.config.getEntryPointDataViaPeer(key, peer)
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
        streamPartID: string,
        joiningEmptyStream: boolean,
        entryPointsFromDht: boolean,
        currentEntrypointCount: number
    ): Promise<void> {
        if (joiningEmptyStream) {
            await this.storeSelfAsEntryPoint(streamPartID)
            setImmediate(() => this.avoidNetworkSplit(streamPartID))
        } else if (entryPointsFromDht && currentEntrypointCount < ENTRYPOINT_STORE_LIMIT) {
            try {
                await this.storeSelfAsEntryPoint(streamPartID)
            } catch (err) {
                logger.trace(`Failed to store self as entrypoint on stream `)
            }
        }
    }

    private async storeSelfAsEntryPoint(streamPartId: string): Promise<void> {
        const ownPeerDescriptor = this.config.ownPeerDescriptor
        const dataToStore = Any.pack(ownPeerDescriptor, PeerDescriptor)
        try {
            await this.config.storeEntryPointData(streamPartIdToDataKey(streamPartId), dataToStore)
            this.keepSelfAsEntryPoint(streamPartId)
        } catch (err) {
            logger.warn(`Failed to store self as entrypoint for ${streamPartId}`)
        }
    }

    private keepSelfAsEntryPoint(streamPartId: string): void {
        if (!this.config.streams.has(streamPartId) || this.servicedStreams.has(streamPartId)) {
            return
        }
        this.servicedStreams.set(streamPartId, setTimeout(async () => {
            if (!this.config.streams.has(streamPartId)) {
                this.servicedStreams.delete(streamPartId)
                return
            }
            logger.trace(`Attempting to keep self as entrypoint for ${streamPartId}`)
            try {
                const discovered = await this.discoverEntryPoints(streamPartId)
                if (discovered.length < ENTRYPOINT_STORE_LIMIT 
                    || discovered.some((peer) => isSamePeerDescriptor(peer, this.config.ownPeerDescriptor))) {
                    await this.storeSelfAsEntryPoint(streamPartId)
                    this.servicedStreams.delete(streamPartId)
                    this.keepSelfAsEntryPoint(streamPartId)
                } else {
                    this.servicedStreams.delete(streamPartId)
                }
            } catch (err) {
                logger.debug(`Failed to keep self as entrypoint for ${streamPartId}`)
            }
        }, this.cacheInterval))
    }

    private async avoidNetworkSplit(streamPartID: string): Promise<void> {
        await exponentialRunOff(async () => {
            if (this.config.streams.has(streamPartID)) {
                const stream = this.config.streams.get(streamPartID)
                const rediscoveredEntrypoints = await this.discoverEntryPoints(streamPartID)
                const sortedEntrypoints = new SortedContactList(PeerID.fromString(streamPartID), 4)
                sortedEntrypoints.addContacts(
                    rediscoveredEntrypoints
                        .filter((entryPoint) => !isSamePeerDescriptor(entryPoint, this.config.ownPeerDescriptor))
                        .map((entryPoint) => new Contact(entryPoint)))
                await Promise.allSettled(sortedEntrypoints.getAllContacts()
                    .map((entryPoint) => stream!.layer1!.joinDht(entryPoint.getPeerDescriptor(), false)))
                if (stream!.layer1!.getBucketSize() < 4) {
                    throw new Error(`Network split is still possible`)
                }
            }
        }, 'avoid network split', this.abortController.signal)
        logger.trace(`Network split avoided`)
    }

    removeSelfAsEntryPoint(streamPartId: string): void {
        if (this.servicedStreams.has(streamPartId)) {
            setImmediate(async () => {
                if (!this.destroyed) {
                    await this.config.deleteEntryPointData(streamPartIdToDataKey(streamPartId))
                }
            })
            clearTimeout(this.servicedStreams.get(streamPartId)!)
            this.servicedStreams.delete(streamPartId)
        }
    }

    async destroy(): Promise<void> {
        this.destroyed = true
        await Promise.all(Array.from(this.servicedStreams.keys()).map((streamPartId) => this.removeSelfAsEntryPoint(streamPartId)))
        this.servicedStreams.clear()
        this.abortController.abort()
    }

}
