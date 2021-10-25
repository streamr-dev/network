import { Logger } from 'streamr-network'
import { StreamPart } from '../../types'
import { StreamMessage } from 'streamr-network/dist/src/streamr-protocol'
import { SubscriptionManager } from '../../SubscriptionManager'
import StreamrClient from 'streamr-client'
import { EthereumStorageEvent } from 'streamr-client/dist/types/src/NodeRegistry'

const logger = new Logger(module)

export interface StorageConfigListener {
    onSPIDAdded: (spid: Protocol.SPID) => void
    onSPIDRemoved: (spid: Protocol.SPID) => void
}

const getSPIDKeys = (streamId: string, partitions: number): Protocol.SPIDKey[] => {
    const keys: Protocol.SPIDKey[] = []
    for (let i = 0; i < partitions; i++) {
        keys.push(Protocol.SPID.toKey(streamId, i))
    }
    return keys
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

    private spidKeys: Set<Protocol.SPIDKey>
    listeners: StorageConfigListener[]
    clusterId: string
    clusterSize: number
    myIndexInCluster: number
    apiUrl: string
    private poller!: ReturnType<typeof setTimeout>
    private stopPoller: boolean

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(clusterId: string, clusterSize: number, myIndexInCluster: number, apiUrl: string) {
        this.spidKeys = new Set<Protocol.SPIDKey>()
        this.listeners = []
        this.clusterId = clusterId
        this.clusterSize = clusterSize
        this.myIndexInCluster = myIndexInCluster
        this.apiUrl = apiUrl
        this.stopPoller = false
    }

    static async createInstance(
        clusterId: string,
        clusterSize: number,
        myIndexInCluster: number,
        apiUrl: string,
        pollInterval: number
    ): Promise<StorageConfig> {
        const instance = new StorageConfig(clusterId, clusterSize, myIndexInCluster, apiUrl)
        // eslint-disable-next-line no-underscore-dangle
        if (pollInterval !== 0) {
            await instance.poll(pollInterval)
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

    hasSPID(spid: Protocol.SPID): boolean {
        const key = Protocol.SPID.toKey(spid.streamId, spid.streamPartition)
        return this.spidKeys.has(key)
    }

    getSPIDs(): Protocol.SPID[] {
        return Array.from(this.spidKeys, (key) => Protocol.SPID.from(key))
    }

    addChangeListener(listener: StorageConfigListener): void {
        this.listeners.push(listener)
    }

    async refresh(): Promise<void> {
        const streamsToStore = await this.streamrClient.getStoredStreamsOf(this.nodeId)
        if (!skipPollResultSoonAfterEvent) {

            const streamKeys = new Set<StreamKey>(streamsToStore.flatMap((stream: { id: string, partitions: number }) => ([
                
                ...getKeysFromStream(stream.id, stream.partitions)
            ])))
            this._setStreams(streamKeys)
        }
    }

    private setSPIDKeys(newKeys: Set<Protocol.SPIDKey>): void {
        const oldKeys = this.spidKeys
        const added = new Set([...newKeys].filter((x) => !oldKeys.has(x)))
        const removed = new Set([...oldKeys].filter((x) => !newKeys.has(x)))

        if (added.size > 0) {
            this.addSPIDKeys(added)
        }

        if (removed.size > 0) {
            this.removeSPIDKeys(removed)
        }
    }

    private addSPIDKeys(keysToAdd: Set<Protocol.SPIDKey>): void {
        logger.info('Add %d partitions to storage config: %s', keysToAdd.size, Array.from(keysToAdd).join(','))
        this.spidKeys = new Set([...this.spidKeys, ...keysToAdd])
        this.listeners.forEach((listener) => {
            keysToAdd.forEach((key: Protocol.SPIDKey) => listener.onSPIDAdded(Protocol.SPID.from(key)))
        })
    }

    private removeSPIDKeys(keysToRemove: Set<Protocol.SPIDKey>): void {
        logger.info('Remove %d partitions from storage config: %s', keysToRemove.size, Array.from(keysToRemove).join(','))
        this.spidKeys = new Set([...this.spidKeys].filter((x) => !keysToRemove.has(x)))
        this.listeners.forEach((listener) => {
            keysToRemove.forEach((key: Protocol.SPIDKey) => listener.onSPIDRemoved(Protocol.SPID.from(key)))
        })
    }

    private belongsToMeInCluster(key: Protocol.SPIDKey): boolean {
        const hashedIndex = Protocol.keyToArrayIndex(this.clusterSize, key.toString())
        return hashedIndex === this.myIndexInCluster
    }

    startAssignmentEventListener(
        streamrAddress: string, 
        subscriptionManager: SubscriptionManager): (msg: Protocol.StreamMessage<AssignmentMessage>
    ) => void {
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        const messageListener = (msg: Protocol.StreamMessage<AssignmentMessage>) => {
            if (msg.messageId.streamId === assignmentStreamId) {
                const content = msg.getParsedContent() as any
                const keys = new Set(getSPIDKeys(content.stream.id, content.stream.partitions))
                if (content.event === 'STREAM_ADDED') {
                    this.addSPIDKeys(keys)
                } else if (content.event === 'STREAM_REMOVED') {
                    this.removeSPIDKeys(keys)
                }
            }
        }
        subscriptionManager.networkNode.addMessageListener(messageListener)
        subscriptionManager.subscribe(assignmentStreamId, 0)
        return messageListener
    }

    onAssignmentEvent(content: { storageNode: string, stream: { id: string, partitions: number }, event: string }): void {
        if (content.storageNode && typeof content.storageNode === 'string' && content.storageNode.toLowerCase() === this.clusterId.toLowerCase()) {
            logger.trace('Received storage assignment message: %o', content)
            const keys = new Set(
                getSPIDKeys(content.stream.id, content.stream.partitions)
                    .filter ((key: Protocol.SPIDKey) => this.belongsToMeInCluster(key))
            )

            logger.trace('Adding %d of %d partitions in stream %s to this instance', keys.size, content.stream.partitions, content.stream.id)

            if (content.event === 'STREAM_ADDED') {
                this.addSPIDKeys(keys)
            } else if (content.event === 'STREAM_REMOVED') {
                this.removeSPIDKeys(keys)
            }
        } else if (!content.storageNode) {
            logger.error('Received storage assignment message with no storageNode field present: %o', content)
        } else {
            logger.trace('Received storage assignment message for another storage node: %o', content)
        }
    }

    stopAssignmentEventListener(
        messageListener: (msg: Protocol.StreamMessage<AssignmentMessage>) => void,
        streamrAddress: string,
        subscriptionManager: SubscriptionManager
    ): void {
        subscriptionManager.networkNode.removeMessageListener(messageListener)
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        subscriptionManager.unsubscribe(assignmentStreamId, 0)
    }

    async startChainEventsListener() {
        const clientAddress = (await this.streamrClient.getAddress()).toLowerCase()
        this.streamrClient.registerStorageEventListener(
            async (event: EthereumStorageEvent) => {
                skipPollResultSoonAfterEvent = true
                if (event.nodeAddress.toLowerCase() !== clientAddress) { return }
                const stream = await this.streamrClient.getStream(event.streamId)
                const streamKeys = getKeysFromStream(stream.id, stream.partitions)
                if (event.type === 'added') {
                    this._addStreams(streamKeys)
                }
                if (event.type === 'removed') {
                    this._removeStreams(streamKeys)
                }
                setTimeout(() => {
                    skipPollResultSoonAfterEvent = false
                }, 10000)
            }
        )
    }

    stopChainEventsListener() {
        this.streamrClient.unRegisterStorageEventListeners()
    }

    private getAssignmentStreamId(streamrAddress: string) {
        return streamrAddress + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
    }

    cleanup(): void {
        this.stopPoller = true
        clearTimeout(this.poller)
    }
}
