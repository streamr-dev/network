import fetch from 'node-fetch';
import { NetworkNode } from 'streamr-network';
import { getLogger } from '../helpers/logger'
import { StreamPart } from '../types';

const logger = getLogger('streamr:storage:StorageConfig')

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

const getKeysFromStream = (streamId: string, partitions: number) => {
    const keys = new Set<StreamKey>()
    for (let i = 0; i < partitions; i++) {
        keys.add(getKeyFromStream(streamId, i))
    }
    return keys
}

export class StorageConfig {

    static ASSIGNMENT_EVENT_STREAM_ID_SUFFIX = '/storage-node-assignments'

    streamKeys: Set<StreamKey>
    listeners: StorageConfigListener[]
    nodeId: string
    apiUrl: string
    private _poller!: ReturnType<typeof setTimeout>
    private _stopPoller: boolean

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(nodeId: string, apiUrl: string) {
        this.streamKeys = new Set<StreamKey>()
        this.listeners = []
        this.nodeId = nodeId
        this.apiUrl = apiUrl
        this._stopPoller = false
    }

    static async createInstance(nodeId: string, apiUrl: string, pollInterval: number): Promise<StorageConfig> {
        const instance = new StorageConfig(nodeId, apiUrl)
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
        const res = await fetch(`${this.apiUrl}/storageNodes/${this.nodeId}/streams`)
        const json = await res.json()
        const streamKeys = new Set<StreamKey>(json.flatMap((stream: { id: string, partitions: number }) => ([
            ...getKeysFromStream(stream.id, stream.partitions)
        ])))
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

    private _addStreams(streamKeys: Set<StreamKey>): void {
        logger.info('Add %d streams to storage config: %o', streamKeys.size, Array.from(streamKeys))
        this.streamKeys = new Set([...this.streamKeys, ...streamKeys])
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamAdded(getStreamFromKey(key)))
        })
    }

    private _removeStreams(streamKeys: Set<StreamKey>): void {
        logger.info('Remove streams from storage config: %o', streamKeys)
        this.streamKeys = new Set([...this.streamKeys].filter((x) => !streamKeys.has(x)))
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    startAssignmentEventListener(streamrAddress: string, networkNode: NetworkNode): void {
        const assignmentStreamId = streamrAddress + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
        networkNode.addMessageListener((msg) => {
            if (msg.messageId.streamId === assignmentStreamId) {
                const content = msg.getParsedContent()
                const keys = new Set(getKeysFromStream(content.stream.id, content.stream.partitions))
                if (content.event === 'STREAM_ADDED') {
                    this._addStreams(keys)
                } else if (content.event === 'STREAM_REMOVED') {
                    this._removeStreams(keys)
                }
            }
        })
        networkNode.subscribe(assignmentStreamId, 0)
    }

    cleanup(): void {
        this._stopPoller = true
        clearTimeout(this._poller)
    }
}
