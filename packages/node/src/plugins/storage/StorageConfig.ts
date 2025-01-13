import { Stream, StreamrClient } from '@streamr/sdk'
import { EthereumAddress, keyToArrayIndex, Logger, StreamPartID } from '@streamr/utils'
import { Diff, SetMembershipSynchronizer } from './SetMembershipSynchronizer'
import { StorageEventListener } from './StorageEventListener'
import { StoragePoller } from './StoragePoller'

const logger = new Logger(module)

export interface StorageConfigListener {
    onStreamPartAdded: (streamPart: StreamPartID) => void
    onStreamPartRemoved: (streamPart: StreamPartID) => void
}

/**
 * Manages the two data sources for storage node assignments (poll-based and
 * event-based), feeding the received full state and partial state updates to
 * `StorageAssignmentSynchronizer`. The state diffs produced by the
 * synchronizer are then further delivered to the user of this class via
 * listeners.
 *
 * The two data sources, heterogeneous in nature, are:
 *
 *  (1) Poll-based storage node assignments occurring on a scheduled interval
 *      (reliable, large payload, infrequent, may be stale)
 *
 *  (2) Event-based storage node assignments picked up in real-time
 *      (intermittent, small payload, frequent, up-to-date)
 *
 *  Event-based assignments are great for picking up on changes quickly.
 *  However, there is a risk of not receiving updates due to, e.g. connectivity
 *  issues. Therefore, if the real-time system fails, polling acts as a sort-of
 *  backup system.
 */
export class StorageConfig {
    private readonly listener: StorageConfigListener
    private readonly synchronizer = new SetMembershipSynchronizer<StreamPartID>()
    private readonly clusterSize: number
    private readonly myIndexInCluster: number
    private readonly storagePoller: StoragePoller
    private readonly storageEventListener: StorageEventListener
    private readonly abortController: AbortController

    constructor(
        clusterId: EthereumAddress,
        clusterSize: number,
        myIndexInCluster: number,
        pollInterval: number,
        streamrClient: StreamrClient,
        listener: StorageConfigListener
    ) {
        this.clusterSize = clusterSize
        this.myIndexInCluster = myIndexInCluster
        this.listener = listener
        this.storagePoller = new StoragePoller(clusterId, pollInterval, streamrClient, async (streams, block) => {
            const streamParts = (
                await Promise.all(
                    streams.map(async (stream: Stream) => {
                        return [...(await this.createMyStreamParts(stream))]
                    })
                )
            ).flat()
            this.handleDiff(this.synchronizer.ingestSnapshot(new Set<StreamPartID>(streamParts), block))
        })
        this.storageEventListener = new StorageEventListener(clusterId, streamrClient, async (stream, type, block) => {
            const streamParts = await this.createMyStreamParts(stream)
            this.handleDiff(this.synchronizer.ingestPatch(streamParts, type, block))
        })
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        this.storageEventListener.start()
        await this.storagePoller.start(this.abortController.signal)
    }

    destroy(): void {
        this.abortController.abort()
        this.storageEventListener.destroy()
    }

    hasStreamPart(streamPart: StreamPartID): boolean {
        return this.getStreamParts().has(streamPart)
    }

    getStreamParts(): ReadonlySet<StreamPartID> {
        return this.synchronizer.getState()
    }

    private async createMyStreamParts(stream: Stream): Promise<Set<StreamPartID>> {
        return new Set<StreamPartID>(
            (await stream.getStreamParts()).filter((streamPart) => {
                const hashedIndex = keyToArrayIndex(this.clusterSize, streamPart)
                return hashedIndex === this.myIndexInCluster
            })
        )
    }

    private handleDiff({ added, removed }: Diff<StreamPartID>): void {
        added.forEach((streamPart) => this.listener.onStreamPartAdded(streamPart))
        removed.forEach((streamPart) => this.listener.onStreamPartRemoved(streamPart))
        logger.info('Updated state', {
            added,
            removed
        })
    }
}
