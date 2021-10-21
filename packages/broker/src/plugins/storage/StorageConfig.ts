import { Logger } from 'streamr-network'
import { StreamPart } from '../../types'
import { StreamMessage } from 'streamr-network/dist/src/streamr-protocol'
import { SubscriptionManager } from '../../SubscriptionManager'
import StreamrClient from 'streamr-client'
import { EthereumStorageEvent } from 'streamr-client/dist/types/src/NodeRegistry'

const logger = new Logger(module)

type StreamKey = string

let skipPollResultSoonAfterEvent = false
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

const getKeysFromStream = (streamId: string, partitions: number) => {
    const keys = new Set<StreamKey>()
    for (let i = 0; i < partitions; i++) {
        keys.add(getKeyFromStream(streamId, i))
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

    streamKeys: Set<StreamKey>
    listeners: StorageConfigListener[]
    nodeId: string
    private _poller!: ReturnType<typeof setTimeout>
    private _stopPoller: boolean
    streamrClient: StreamrClient

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(nodeId: string, streamrClient: StreamrClient) {
        this.streamKeys = new Set<StreamKey>()
        this.listeners = []
        this.nodeId = nodeId
        this._stopPoller = false
        this.streamrClient = streamrClient
    }

    static async createInstance(nodeId: string, streamrClient: StreamrClient, pollInterval: number): Promise<StorageConfig> {
        const instance = new StorageConfig(nodeId, streamrClient)
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
        const streamsToStore = await this.streamrClient.getStoredStreamsOf(this.nodeId)
        if (!skipPollResultSoonAfterEvent) {

            const streamKeys = new Set<StreamKey>(streamsToStore.flatMap((stream: { id: string, partitions: number }) => ([
                
                ...getKeysFromStream(stream.id, stream.partitions)
            ])))
            this._setStreams(streamKeys)
        }
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

    private _addStreams(streamKeys: Set<StreamKey>): void {
        logger.info('Add %d streams to storage config: %s', streamKeys.size, Array.from(streamKeys).join(','))
        this.streamKeys = new Set([...this.streamKeys, ...streamKeys])
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamAdded(getStreamFromKey(key)))
        })
    }

    private _removeStreams(streamKeys: Set<StreamKey>): void {
        logger.info('Remove %d streams from storage config: %s', streamKeys.size, Array.from(streamKeys).join(','))
        this.streamKeys = new Set([...this.streamKeys].filter((x) => !streamKeys.has(x)))
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    startAssignmentEventListener(streamrAddress: string, subscriptionManager: SubscriptionManager): (msg: StreamMessage<AssignmentMessage>) => void {
        const assignmentStreamId = this.getAssignmentStreamId(streamrAddress)
        const messageListener = (msg: StreamMessage<AssignmentMessage>) => {
            if (msg.messageId.streamId === assignmentStreamId) {
                const content = msg.getParsedContent() as any
                const keys = new Set(getKeysFromStream(content.stream.id, content.stream.partitions))
                if (content.event === 'STREAM_ADDED') {
                    this._addStreams(keys)
                } else if (content.event === 'STREAM_REMOVED') {
                    this._removeStreams(keys)
                }
            }
        }
        subscriptionManager.networkNode.addMessageListener(messageListener)
        subscriptionManager.subscribe(assignmentStreamId, 0)
        return messageListener
    }

    stopAssignmentEventListener(messageListener: (msg: StreamMessage<AssignmentMessage>) => void, streamrAddress: string, subscriptionManager: SubscriptionManager) {
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
        this._stopPoller = true
        clearTimeout(this._poller)
    }
}
