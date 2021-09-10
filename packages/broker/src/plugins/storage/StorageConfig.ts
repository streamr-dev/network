import fetch from 'node-fetch'
import { Logger } from 'streamr-network'
import { StreamPart } from '../../types'
import { Protocol } from 'streamr-network'
import { SubscriptionManager } from '../../SubscriptionManager'

const logger = new Logger(module)

type StreamKey = string

export interface StorageConfigListener {
    onStreamAdded: (streamPart: StreamPart) => void
    onStreamRemoved: (streamPart: StreamPart) => void
}

/*
 * Connects to Core API and queries the configuration there.
 * Refreshes the config at regular intervals.
 */
const getStreamFromKey = (key: StreamKey): StreamPart => {
    const [id, partitionStr] = key.split('::')
    return {
        id,
        partition: Number(partitionStr)
    }
}

const getKeyFromStream = (streamId: string, streamPartition: number): StreamKey => {
    return `${streamId}::${streamPartition}`
}

const getKeysFromStream = (streamId: string, partitions: number): StreamKey[] => {
    const keys: StreamKey[] = []
    for (let i = 0; i < partitions; i++) {
        keys.push(getKeyFromStream(streamId, i))
    }
    return keys
}

export class StorageConfig {

    static ASSIGNMENT_EVENT_STREAM_ID_SUFFIX = '/storage-node-assignments'

    streamKeys: Set<StreamKey>
    listeners: StorageConfigListener[]
    clusterId: string
    clusterSize: number
    myIndexInCluster: number
    apiUrl: string
    private _poller!: ReturnType<typeof setTimeout>
    private _stopPoller: boolean

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(clusterId: string, clusterSize: number, myIndexInCluster: number, apiUrl: string) {
        this.streamKeys = new Set<StreamKey>()
        this.listeners = []
        this.clusterId = clusterId
        this.clusterSize = clusterSize
        this.myIndexInCluster = myIndexInCluster
        this.apiUrl = apiUrl
        this._stopPoller = false
    }

    static async createInstance(clusterId: string, clusterSize: number, myIndexInCluster: number, apiUrl: string, pollInterval: number): Promise<StorageConfig> {
        const instance = new StorageConfig(clusterId, clusterSize, myIndexInCluster, apiUrl)
        // eslint-disable-next-line no-underscore-dangle
        if (pollInterval !== 0) {
            await instance._poll(pollInterval)
        }
        return instance
    }

    private async _poll(pollInterval: number): Promise<void> {
        if (this._stopPoller) { return }

        try {
            await this.refresh()
        } catch (err) {
            logger.warn(`Unable to refresh storage config: ${err}`)
        }

        if (this._stopPoller) { return }

        clearTimeout(this._poller)
        // eslint-disable-next-line require-atomic-updates
        this._poller = setTimeout(() => this._poll(pollInterval), pollInterval)
    }

    hasStream(stream: StreamPart): boolean {
        const key = getKeyFromStream(stream.id, stream.partition)
        return this.streamKeys.has(key)
    }

    getStreams(): StreamPart[] {
        return Array.from(this.streamKeys).map((key) => getStreamFromKey(key))
    }

    addChangeListener(listener: StorageConfigListener): void {
        this.listeners.push(listener)
    }

    async refresh(): Promise<void> {
        const res = await fetch(`${this.apiUrl}/storageNodes/${this.clusterId}/streams`)
        const json = await res.json()
        const streamKeys = new Set<StreamKey>(
            json.flatMap((stream: { id: string, partitions: number }) => ([
                ...getKeysFromStream(stream.id, stream.partitions)
            ])).filter ((key: StreamKey) => this.belongsToMeInCluster(key))
        )
        this._setStreams(streamKeys)
    }

    private _setStreams(newKeys: Set<StreamKey>): void {
        const oldKeys = this.streamKeys
        const added = new Set([...newKeys].filter((x) => !oldKeys.has(x)))
        const removed = new Set([...oldKeys].filter((x) => !newKeys.has(x)))

        if (added.size > 0) {
            this._addStreams(added)
        }

        if (removed.size > 0) {
            this._removeStreams(removed)
        }
    }

    private _addStreams(keysToAdd: Set<StreamKey>): void {
        logger.info('Add %d streams to storage config: %s', keysToAdd.size, Array.from(keysToAdd).join(','))
        this.streamKeys = new Set([...this.streamKeys, ...keysToAdd])
        this.listeners.forEach((listener) => {
            keysToAdd.forEach((key: StreamKey) => listener.onStreamAdded(getStreamFromKey(key)))
        })
    }

    private _removeStreams(keysToRemove: Set<StreamKey>): void {
        logger.info('Remove %d streams from storage config: %s', keysToRemove.size, Array.from(keysToRemove).join(','))
        this.streamKeys = new Set([...this.streamKeys].filter((x) => !keysToRemove.has(x)))
        this.listeners.forEach((listener) => {
            keysToRemove.forEach((key: StreamKey) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    private belongsToMeInCluster(key: StreamKey): boolean {
        const hashedIndex = Protocol.Utils.keyToArrayIndex(this.clusterSize, key.toString())
        return hashedIndex === this.myIndexInCluster
    }

    startAssignmentEventListener(streamrAddress: string, subscriptionManager: SubscriptionManager): (msg: Protocol.StreamMessage) => void {
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        const messageListener = (msg: Protocol.StreamMessage) => {
            if (msg.messageId.streamId === assignmentStreamId) {
                const content = msg.getParsedContent()
                this.onAssignmentEvent(content)
            }
        }
        subscriptionManager.networkNode.addMessageListener(messageListener)
        subscriptionManager.subscribe(assignmentStreamId, 0)
        return messageListener
    }

    onAssignmentEvent(content: { storageNode: string, stream: { id: string, partitions: number }, event: string }) {
        if (content.storageNode && content.storageNode.toLowerCase() == this.clusterId.toLowerCase()) {
            logger.trace('Received storage assignment message: %o', content)
            const keys = new Set(
                getKeysFromStream(content.stream.id, content.stream.partitions)
                    .filter ((key: StreamKey) => this.belongsToMeInCluster(key))
            )

            logger.trace('Adding %d of %d partitions in stream %s to this instance', keys.size, content.stream.partitions, content.stream.id)

            if (content.event === 'STREAM_ADDED') {
                this._addStreams(keys)
            } else if (content.event === 'STREAM_REMOVED') {
                this._removeStreams(keys)
            }
        } else if (!content.storageNode) {
            logger.error('Received storage assignment message with no storageNode field present: %o', content)
        } else {
            logger.trace('Received storage assignment message for another storage node: %o', content)
        }
    }

    stopAssignmentEventListener(messageListener: (msg: Protocol.StreamMessage) => void, streamrAddress: string, subscriptionManager: SubscriptionManager) {
        subscriptionManager.networkNode.removeMessageListener(messageListener)
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        subscriptionManager.unsubscribe(assignmentStreamId, 0)
    }

    private getAssignmentStreamId(streamrAddress: string) {
        return streamrAddress + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
    }

    cleanup(): void {
        this._stopPoller = true
        clearTimeout(this._poller)
    }
}
