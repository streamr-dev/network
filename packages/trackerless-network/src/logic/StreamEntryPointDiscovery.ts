import { createHash } from 'crypto'
import { DhtNode, isSamePeerDescriptor, PeerDescriptor } from '@streamr/dht'
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

export class StreamEntryPointDiscovery {
    private readonly layer0: DhtNode
    private readonly abortController: AbortController
    private readonly streams: Map<string, StreamObject>

    constructor(layer0: DhtNode, streams: Map<string, StreamObject>) {
        this.layer0 = layer0
        this.abortController = new AbortController()
        this.streams = streams
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
            discoveredEntryPoints.push(this.layer0!.getPeerDescriptor())
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
            const results = await this.layer0!.getDataFromDht(dataKey)
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
        const ownPeerDescriptor = this.layer0.getPeerDescriptor()
        const dataToStore = Any.pack(ownPeerDescriptor, PeerDescriptor)
        try {
            await this.layer0!.storeDataToDht(streamPartIdToDataKey(streamPartId), dataToStore)
        } catch (err) {
            logger.warn(`Failed to store self (${this.layer0!.getNodeId()}) as entrypoint for ${streamPartId}`)
        }
    }

    private async avoidNetworkSplit(streamPartID: string): Promise<void> {
        await exponentialRunOff(async () => {
            if (this.streams.has(streamPartID)) {
                const stream = this.streams.get(streamPartID)
                const rediscoveredEntrypoints = await this.discoverEntrypoints(streamPartID)
                await Promise.all(rediscoveredEntrypoints
                    .filter((entryPoint) => !isSamePeerDescriptor(entryPoint, this.layer0.getPeerDescriptor()))
                    .map((entrypoint) => stream!.layer1.joinDht(entrypoint, false)))
                if (stream!.layer1.getBucketSize() === 0) {
                    throw new Error(`Node is alone in stream or a network split is still possible`)
                }
            }
        }, 'avoid network split', this.abortController.signal)
        logger.info(`Network split avoided`)
    }

    stop(): void {
        this.abortController.abort()
    }

}
