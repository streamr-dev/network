const fetch = require('node-fetch')

const logger = require('../helpers/logger')('streamr:storage:StorageConfig')

/*
 * Connects to Core API and queries the configuration there.
 * Refreshes the config at regular intervals.
 */
const getStreamFromKey = (key) => {
    const [id, partitionStr] = key.split('::')
    return {
        id,
        partition: Number(partitionStr)
    }
}

const getKeyFromStream = (streamId, streamPartition) => {
    return `${streamId}::${streamPartition}`
}

const getKeysFromStream = (streamId, partitions) => {
    const keys = new Set()
    for (let i = 0; i < partitions; i++) {
        keys.add(getKeyFromStream(streamId, i))
    }
    return keys
}

module.exports = class StorageConfig {
    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(nodeId, apiUrl) {
        this.streamKeys = new Set()
        this.listeners = []
        this.nodeId = nodeId
        this.apiUrl = apiUrl
        this._poller = undefined
        this._stopPoller = false
    }

    static async createInstance(nodeId, apiUrl, pollInterval) {
        const instance = new StorageConfig(nodeId, apiUrl)
        // eslint-disable-next-line no-underscore-dangle
        await instance._poll(pollInterval)
        return instance
    }

    async _poll(pollInterval) {
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

    hasStream(stream) {
        const key = getKeyFromStream(stream.id, stream.partition)
        return this.streamKeys.has(key)
    }

    getStreams() {
        return Array.from(this.streamKeys.values()).map((key) => getStreamFromKey(key))
    }

    addChangeListener(listener) {
        this.listeners.push(listener)
    }

    refresh() {
        return fetch(`${this.apiUrl}/storageNodes/${this.nodeId}/streams`)
            .then((res) => res.json())
            .then((json) => {
                let streamKeys = new Set()
                json.forEach((stream) => {
                    streamKeys = new Set([...streamKeys, ...getKeysFromStream(stream.id, stream.partitions)])
                })
                this._setStreams(streamKeys)
                return undefined
            })
    }

    _setStreams(streamKeys) {
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

    _addStreams(streamKeys) {
        logger.info('Add stream to storage config: ' + Array.from(streamKeys).join())
        this.streamKeys = new Set([...this.streamKeys, ...streamKeys])
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key) => listener.onStreamAdded(getStreamFromKey(key)))
        })
    }

    _removeStreams(streamKeys) {
        logger.info('Remove stream to storage config: ' + Array.from(streamKeys).join())
        this.streamKeys = new Set([...this.streamKeys].filter((x) => !streamKeys.has(x)))
        this.listeners.forEach((listener) => {
            streamKeys.forEach((key) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    startAssignmentEventListener(streamrAddress, networkNode) {
        const assignmentStreamId = streamrAddress + '/storage-node-assignments'
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
