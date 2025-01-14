import { areEqualPeerDescriptors, DhtAddress, toNodeId, PeerDescriptor } from '@streamr/dht'
import { Logger, wait } from '@streamr/utils'
import { DiscoveryLayerNode } from './DiscoveryLayerNode'

/*
 * Tries to find new neighbors if we currently have less than MIN_NEIGHBOR_COUNT neigbors. It does so by
 * rejoining the stream's control layer network.
 *
 * This way we can avoid some network split scenarios. The functionality is most relevant for small stream
 * networks.
 */

const logger = new Logger(module)

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
        } catch {
            logger.trace(`${description} failed, retrying in ${delay} ms`)
        }
        try {
            // Abort controller throws unexpected errors in destroy?
            await wait(delay, abortSignal)
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            logger.trace(`${err}`) // TODO Do we need logging?
        }
    }
}

export const MIN_NEIGHBOR_COUNT = 4

export interface StreamPartNetworkSplitAvoidanceOptions {
    discoveryLayerNode: DiscoveryLayerNode
    discoverEntryPoints: (excludedNodes?: Set<DhtAddress>) => Promise<PeerDescriptor[]>
    exponentialRunOfBaseDelay?: number
}

export class StreamPartNetworkSplitAvoidance {
    private readonly abortController: AbortController
    private readonly options: StreamPartNetworkSplitAvoidanceOptions
    private readonly excludedNodes: Set<DhtAddress> = new Set()
    private running = false

    constructor(options: StreamPartNetworkSplitAvoidanceOptions) {
        this.options = options
        this.abortController = new AbortController()
    }

    public async avoidNetworkSplit(): Promise<void> {
        this.running = true
        await exponentialRunOff(
            async () => {
                const discoveredEntrypoints = await this.options.discoverEntryPoints()
                const filteredEntryPoints = discoveredEntrypoints.filter(
                    (peer) => !this.excludedNodes.has(toNodeId(peer))
                )
                await this.options.discoveryLayerNode.joinDht(filteredEntryPoints, false, false)
                if (this.options.discoveryLayerNode.getNeighborCount() < MIN_NEIGHBOR_COUNT) {
                    // Filter out nodes that are not neighbors as those nodes are assumed to be offline
                    const newExcludes = filteredEntryPoints
                        .filter(
                            (peer) =>
                                !this.options.discoveryLayerNode
                                    .getNeighbors()
                                    .some((neighbor) => areEqualPeerDescriptors(neighbor, peer))
                        )
                        .map((peer) => toNodeId(peer))
                    newExcludes.forEach((node) => this.excludedNodes.add(node))
                    throw new Error(`Network split is still possible`)
                }
            },
            'avoid network split',
            this.abortController.signal,
            this.options.exponentialRunOfBaseDelay
        )
        this.running = false
        this.excludedNodes.clear()
        logger.trace(`Network split avoided`)
    }

    public isRunning(): boolean {
        return this.running
    }

    destroy(): void {
        this.abortController.abort()
    }
}
