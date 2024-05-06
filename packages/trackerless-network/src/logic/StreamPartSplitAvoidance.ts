import { areEqualPeerDescriptors, DhtAddress, getNodeIdFromPeerDescriptor, PeerDescriptor } from '@streamr/dht'
import { Logger, wait } from '@streamr/utils'
import { Layer1Node } from './Layer1Node'

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
        } catch (e: any) {
            logger.info(`${description} failed, retrying in ${delay} ms`)
        }
        try { // Abort controller throws unexpected errors in destroy?
            await wait(delay, abortSignal)
        } catch (err) {
            logger.trace(`${err}`)  // TODO Do we need logging?
        }
    }
}

export const SPLIT_AVOIDANCE_LIMIT = 4

export interface StreamPartSplitAvoidanceConfig {
    layer1Node: Layer1Node
    discoverEntryPoints: (excludedNodes?: Set<DhtAddress>) => Promise<PeerDescriptor[]>
    exponentialRunOfBaseDelay?: number
}

export class StreamPartSplitAvoidance {

    private readonly abortController: AbortController
    private readonly config: StreamPartSplitAvoidanceConfig
    private readonly excludedNodes: Set<DhtAddress> = new Set()
    private running = false

    constructor(config: StreamPartSplitAvoidanceConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    public async avoidNetworkSplit(): Promise<void> {
        this.running = true
        await exponentialRunOff(async () => {
            const discoveredEntrypoints = await this.config.discoverEntryPoints(this.excludedNodes)
            await this.config.layer1Node.joinDht(discoveredEntrypoints, false, false)
            if (this.config.layer1Node.getNeighborCount() < SPLIT_AVOIDANCE_LIMIT) {
                // Filter out nodes that are not neighbors as those nodes are assumed to be offline
                const newExcludes = discoveredEntrypoints
                    .filter((peer) => !this.config.layer1Node.getNeighbors()
                        .some((neighbor) => areEqualPeerDescriptors(neighbor, peer)))
                    .map((peer) => getNodeIdFromPeerDescriptor(peer))
                newExcludes.forEach((node) => this.excludedNodes.add(node))
                throw new Error(`Network split is still possible`)
            }
        }, 'avoid network split', this.abortController.signal, this.config.exponentialRunOfBaseDelay)
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
