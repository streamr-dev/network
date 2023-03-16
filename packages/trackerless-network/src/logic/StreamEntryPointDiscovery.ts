import { createHash } from 'crypto'
import {
    isSamePeerDescriptor,
    PeerDescriptor,
    PeerID,
    Contact,
    SortedContactList,
    peerIdFromPeerDescriptor,
    RecursiveFindResult
} from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'
import { Logger, wait } from '@streamr/utils'
import { StreamObject } from './StreamrNode'

export const streamPartIdToDataKey = (streamPartId: string): Uint8Array => {
    return new Uint8Array(createHash('md5').update(streamPartId).digest())
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
    baseDelay = 1000,
    maxAttempts = 5
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
            logger.warn(`${description} failed, retrying in ${delay} ms`)
        }
        try { // Abort controller throws unexpected errors in destroy?
            await wait(delay, abortSignal)
        } catch (err) {
            logger.trace(err)
        }
    }
}

const logger = new Logger(module)

const ENTRYPOINT_STORE_LIMIT = 8

interface StreamEntryPointDiscoveryConfig {
    streams: Map<string, StreamObject>
    ownPeerDescriptor: PeerDescriptor
    getEntryPointData: (key: Uint8Array) => Promise<RecursiveFindResult>
    storeEntryPointData: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
}

export class StreamEntryPointDiscovery {
    private readonly abortController: AbortController
    private readonly config: StreamEntryPointDiscoveryConfig

    constructor(config: StreamEntryPointDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    async discoverEntryPointsFromDht(streamPartID: string, knownEntryPointCount: number): Promise<FindEntryPointsResult> {
        if (knownEntryPointCount > 0) {
            return {
                joiningEmptyStream: false,
                entryPointsFromDht: false,
                discoveredEntryPoints: []
            }
        }
        let joiningEmptyStream = false
        const discoveredEntryPoints = await this.discoverEntrypoints(streamPartID)
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

    private async discoverEntrypoints(streamPartId: string): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(streamPartId)
        try {
            const results = await this.config.getEntryPointData(dataKey)
            if (results.dataEntries) {
                return results.dataEntries!.map((entry) => entry.storer!)
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
        } catch (err) {
            logger.warn(`Failed to store self (${peerIdFromPeerDescriptor(this.config.ownPeerDescriptor)}) as entrypoint for ${streamPartId}`)
        }
    }

    private async avoidNetworkSplit(streamPartID: string): Promise<void> {
        await exponentialRunOff(async () => {
            if (this.config.streams.has(streamPartID)) {
                const stream = this.config.streams.get(streamPartID)
                const rediscoveredEntrypoints = await this.discoverEntrypoints(streamPartID)
                const sortedEntrypoints = new SortedContactList(PeerID.fromString(streamPartID), 4)
                sortedEntrypoints.addContacts(
                    rediscoveredEntrypoints
                        .filter((entryPoint) => !isSamePeerDescriptor(entryPoint, this.config.ownPeerDescriptor))
                        .map((entryPoint) => new Contact(entryPoint)))
                await Promise.allSettled(sortedEntrypoints.getAllContacts()
                    .map((entryPoint) => stream!.layer1.joinDht(entryPoint.getPeerDescriptor(), false)))
                if (stream!.layer1.getBucketSize() === 0) {
                    throw new Error(`Node is alone in stream or a network split is still possible`)
                }
            }
        }, 'avoid network split', this.abortController.signal)
        logger.info(`Network split avoided`)
    }

    destroy(): void {
        this.abortController.abort()
    }

}
