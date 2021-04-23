import fetch from 'node-fetch';
import { NetworkNode } from 'streamr-network';
import getLogger from '../helpers/logger'
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
    _poller?: NodeJS.Timeout
    _stopPoller: boolean

    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(nodeId: string, apiUrl: string) {
        this.streamKeys = new Set<StreamKey>()
        this.listeners = []
        this.nodeId = nodeId
        this.apiUrl = apiUrl
        this._poller = undefined
        this._stopPoller = false
    }

    static async createInstance(nodeId: string, apiUrl: string, pollInterval: number) {
        const instance = new StorageConfig(nodeId, apiUrl)
        // eslint-disable-next-line no-underscore-dangle
        await instance._poll(pollInterval)
        return instance
    }

    async _poll(pollInterval: number) {
        try {
            await this.refresh()
        } catch (e) {
            logger.warn(`Unable to refresh storage config: ${e}`)
        }
        if (!this._stopPoller) {
            // eslint-disable-next-line require-atomic-updates
            this._poller = setTimeout(() => this._poll(pollInterval), pollInterval)
        }
    }

    hasStream(stream: StreamPart) {
        const key = getKeyFromStream(stream.id, stream.partition)
        return this.streamKeys.has(key)
    }

    getStreams() {
        return Array.from(this.streamKeys.values()).map((key) => getStreamFromKey(key))
    }

    addChangeListener(listener: StorageConfigListener) {
        this.listeners.push(listener)
    }

    refresh() {
        return fetch(`${this.apiUrl}/storageNodes/${this.nodeId}/streams`)
            .then((res) => res.json())
            .then((json) => {
                let streamKeys = new Set<StreamKey>()
                json.forEach((stream: { id: string, partitions: number }) => {
                    streamKeys = new Set([...streamKeys, ...getKeysFromStream(stream.id, stream.partitions)])
                })
                this._setStreams(streamKeys)
                return undefined
            })
    }

    _setStreams(streamKeys: Set<StreamKey>) {
        const oldKeys = this.streamKeys
        const newKeys = streamKeys
        const added = new Set([...newKeys].filter((x) => !oldKeys.has(x)))
        const removed = new Set([...oldKeys].filter((x) => !newKeys.has(x)))
        if (added.size > 0) {
            this._addStreams(added)
        }
        if (removed.size > 0) {
            this._removeStreams(removed)
        }
    }

    _addStreams(streamKeys: Set<StreamKey>) {
        logger.info('Add stream to storage config: ' + Array.from(streamKeys).join())
        this.streamKeys = new Set([...this.streamKeys, ...streamKeys])
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamAdded(getStreamFromKey(key)))
        })
    }

    _removeStreams(streamKeys: Set<StreamKey>) {
        logger.info('Remove stream to storage config: ' + Array.from(streamKeys).join())
        this.streamKeys = new Set([...this.streamKeys].filter((x) => !streamKeys.has(x)))
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key: StreamKey) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    startAssignmentEventListener(streamrAddress: string, networkNode: NetworkNode) {
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

    cleanup() {
        this._stopPoller = true
        if (this._poller !== undefined) {
            clearTimeout(this._poller)
        }
    }
}
