import { Logger, NetworkNode } from 'streamr-network'
import { StreamMessage, keyToArrayIndex, StreamPartID, toStreamPartID, StreamID, toStreamID } from 'streamr-client-protocol'
import StreamrClient from 'streamr-client'
// TODO fix the import
import { EthereumStorageEvent } from 'streamr-client/dist/types/src/NodeRegistry'

const logger = new Logger(module)

const ASSIGNMENT_STREAM_PARTITION = 0

let skipPollResultSoonAfterEvent = false
export interface StorageConfigListener {
    onStreamPartAdded: (streamPart: StreamPartID) => void
    onStreamPartRemoved: (streamPart: StreamPartID) => void
}

const createStreamPartIDs = (streamId: StreamID, partitions: number): StreamPartID[] => {
    const ids: StreamPartID[] = []
    for (let i = 0; i < partitions; i++) {
        ids.push(toStreamPartID(streamId, i))
    }
    return ids
}

export type AssignmentMessage = {
    stream: {
        id: string,
        partitions: number,
    },
    event: 'STREAM_ADDED' | 'STREAM_REMOVED',
}

export class StorageConfig {

    static ASSIGNMENT_EVENT_STREAM_ID_SUFFIX = '/storage-node-assignments'

    private streamParts: Set<StreamPartID>
    listeners: StorageConfigListener[]
    clusterId: string
    clusterSize: number
    myIndexInCluster: number
    private poller!: ReturnType<typeof setTimeout>
    private stopPoller: boolean
    streamrClient: StreamrClient
    networkNode: NetworkNode
    private removeConfirmations = new Map<StreamPartID, number>()

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(
        clusterId: string,
        clusterSize: number,
        myIndexInCluster: number,
        streamrClient: StreamrClient,
        networkNode: NetworkNode
    ) {
        this.streamParts = new Set<StreamPartID>()
        this.listeners = []
        this.clusterId = clusterId
        this.clusterSize = clusterSize
        this.myIndexInCluster = myIndexInCluster
        this.stopPoller = false
        this.streamrClient = streamrClient
        this.networkNode = networkNode
    }

    static async createInstance(
        clusterId: string,
        clusterSize: number,
        myIndexInCluster: number,
        pollInterval: number,
        streamrClient: StreamrClient
    ): Promise<StorageConfig> {
        const networkNode = await streamrClient.getNode()
        const instance = new StorageConfig(clusterId, clusterSize, myIndexInCluster, streamrClient, networkNode)
        // eslint-disable-next-line no-underscore-dangle
        if (pollInterval !== 0) {
            await instance.poll(pollInterval)
        } else {
            await instance.refresh()
        }

        return instance
    }

    /*
     * Connects to Core API and queries the configuration there.
     * Refreshes the config at regular intervals.
     */
    private async poll(pollInterval: number): Promise<void> {
        if (this.stopPoller) { return }

        try {
            await this.refresh()
        } catch (err) {
            logger.warn(`Unable to refresh storage config: ${err}`)
        }

        if (this.stopPoller) { return }

        clearTimeout(this.poller)
        // eslint-disable-next-line require-atomic-updates
        this.poller = setTimeout(() => this.poll(pollInterval), pollInterval)
    }

    hasStreamPart(streamPart: StreamPartID): boolean {
        return this.streamParts.has(streamPart)
    }

    getStreamParts(): Set<StreamPartID> {
        return this.streamParts
    }

    addChangeListener(listener: StorageConfigListener): void {
        this.listeners.push(listener)
    }

    async refresh(): Promise<void> {
        const streamsToStore = await this.streamrClient.getStoredStreamsOf(this.clusterId)
        if (!skipPollResultSoonAfterEvent) {

            const streamParts = new Set<StreamPartID>(streamsToStore.flatMap((stream: { id: StreamID, partitions: number }) => ([
                ...createStreamPartIDs(stream.id, stream.partitions)
            ])).filter ((streamPart: StreamPartID) => this.belongsToMeInCluster(streamPart)))
            this.setStreamParts(streamParts)
        }
    }

    private setStreamParts(newStreamParts: Set<StreamPartID>): void {
        const oldStreamParts = this.streamParts
        const added = new Set([...newStreamParts].filter((x) => !oldStreamParts.has(x)))
        const removed = new Set([...oldStreamParts].filter((x) => !newStreamParts.has(x)))

        if (added.size > 0) {
            this.addStreamParts(added)
        }

        if (removed.size > 0) {
            this.prepareToRemoveStreams(removed)
        }
    }

    private prepareToRemoveStreams(streamParts: Set<StreamPartID>): void {
        // only remove streams after removed for REMOVE_CONFIRMATIONS polls
        // works around timing issue between storage assignment events and storage endpoint
        // i.e. poll result may be outdated, so storage can be added, removed in
        // outdated poll, then added again in next poll
        const REMOVE_CONFIRMATIONS = 2
        for (const streamPart of streamParts) {
            // count confirmations
            const confirmations = (Number(this.removeConfirmations.get(streamPart)) + 1) || 1
            this.removeConfirmations.set(streamPart, confirmations)
        }

        const confirmedForRemoval = new Set<StreamPartID>()
        for (const [streamPart, confirmations] of this.removeConfirmations) {
            if (confirmations >= REMOVE_CONFIRMATIONS) {
                // got enough confirmations, remove
                confirmedForRemoval.add(streamPart)
                this.removeConfirmations.delete(streamPart)
            }

            if (!streamParts.has(streamPart)) {
                if (confirmations === 1) {
                    this.removeConfirmations.delete(streamPart)
                } else {
                    this.removeConfirmations.set(streamPart, confirmations - 1)
                }
            }
        }

        return this.removeStreamParts(confirmedForRemoval)
    }

    private addStreamParts(streamParts: Set<StreamPartID>): void {
        logger.info('Add %d partitions to storage config: %s', streamParts.size, Array.from(streamParts).join(','))
        this.streamParts = new Set([...this.streamParts, ...streamParts])
        this.listeners.forEach((listener) => {
            streamParts.forEach((streamPart: StreamPartID) => listener.onStreamPartAdded(streamPart))
        })
    }

    private removeStreamParts(streamParts: Set<StreamPartID>): void {
        logger.info('Remove %d partitions from storage config: %s', streamParts.size, Array.from(streamParts).join(','))
        this.streamParts = new Set([...this.streamParts].filter((x) => !streamParts.has(x)))
        this.listeners.forEach((listener) => {
            streamParts.forEach((streamPart: StreamPartID) => listener.onStreamPartRemoved(streamPart))
        })
    }

    private belongsToMeInCluster(streamPart: StreamPartID): boolean {
        const hashedIndex = keyToArrayIndex(this.clusterSize, streamPart)
        return hashedIndex === this.myIndexInCluster
    }

    startAssignmentEventListener(
        streamrAddress: string): (msg: StreamMessage<AssignmentMessage>
    ) => void {
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        const messageListener = (msg: StreamMessage<AssignmentMessage>) => {
            if (msg.messageId.streamId === assignmentStreamId) {
                const content = msg.getParsedContent() as any
                const streamParts = new Set(createStreamPartIDs(content.stream.id, content.stream.partitions))
                if (content.event === 'STREAM_ADDED') {
                    this.addStreamParts(streamParts)
                } else if (content.event === 'STREAM_REMOVED') {
                    this.removeStreamParts(streamParts)
                }
            }
        }
        // TODO: NET-637 use client instead of networkNode?
        this.networkNode.addMessageListener(messageListener)
        this.networkNode.subscribe(toStreamPartID(assignmentStreamId, ASSIGNMENT_STREAM_PARTITION))
        return messageListener
    }

    onAssignmentEvent(content: { storageNode: string, stream: { id: string, partitions: number }, event: string }): void {
        if (content.storageNode && typeof content.storageNode === 'string' && content.storageNode.toLowerCase() === this.clusterId.toLowerCase()) {
            logger.trace('Received storage assignment message: %o', content)
            const streamParts = new Set(
                createStreamPartIDs(toStreamID(content.stream.id), content.stream.partitions)
                    .filter ((streamPart: StreamPartID) => this.belongsToMeInCluster(streamPart))
            )

            logger.trace('Adding %d of %d partitions in stream %s to this instance', streamParts.size, content.stream.partitions, content.stream.id)

            if (content.event === 'STREAM_ADDED') {
                this.addStreamParts(streamParts)
            } else if (content.event === 'STREAM_REMOVED') {
                this.removeStreamParts(streamParts)
            }
        } else if (!content.storageNode) {
            logger.error('Received storage assignment message with no storageNode field present: %o', content)
        } else {
            logger.trace('Received storage assignment message for another storage node: %o', content)
        }
    }

    stopAssignmentEventListener(
        messageListener: (msg: StreamMessage<AssignmentMessage>) => void,
        streamrAddress: string
    ): void {
        // TODO: NET-637 use client instead of networkNode?
        this.networkNode.removeMessageListener(messageListener)
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        this.networkNode.unsubscribe(toStreamPartID(assignmentStreamId, ASSIGNMENT_STREAM_PARTITION))
    }

    async startChainEventsListener(): Promise<void> {
        const clientAddress = (await this.streamrClient.getAddress()).toLowerCase()
        this.streamrClient.registerStorageEventListener(
            async (event: EthereumStorageEvent) => {
                if (event.nodeAddress.toLowerCase() !== clientAddress) { return }
                skipPollResultSoonAfterEvent = true
                try {
                    const stream = await this.streamrClient.getStream(event.streamId)
                    const streamParts = new Set(
                        createStreamPartIDs(stream.id, stream.partitions)
                            .filter((streamPart: StreamPartID) => this.belongsToMeInCluster(streamPart))
                    )
                    if (event.type === 'added') {
                        this.addStreamParts(streamParts)
                    }
                    if (event.type === 'removed') {
                        this.removeStreamParts(streamParts)
                    }
                } catch (e) {
                    logger.warn('chainEventsListener: %s', e)
                } finally {
                    setTimeout(() => {
                        skipPollResultSoonAfterEvent = false
                    }, 10000)
                }
            }
        )
    }

    stopChainEventsListener(): Promise<void> {
        return this.streamrClient.unRegisterStorageEventListeners()
    }

    private getAssignmentStreamId(streamrAddress: string): StreamID {
        return toStreamID(streamrAddress + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX)
    }

    cleanup(): void {
        this.stopPoller = true
        clearTimeout(this.poller)
    }
}
