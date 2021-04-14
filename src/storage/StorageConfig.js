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

module.exports = class StorageConfig {
    // use createInstance method instead: it fetches the up-to-date config from API
    constructor(nodeId, apiUrl) {
        this.streams = new Set()
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

    getStreams() {
        return Array.from(this.streams.values()).map((key) => getStreamFromKey(key))
    }

    addChangeListener(listener) {
        this.listeners.push(listener)
    }

    refresh() {
        return fetch(`${this.apiUrl}/storageNodes/${this.nodeId}/streams`)
            .then((res) => res.json())
            .then((json) => {
                const streamKeys = []
                json.forEach((stream) => {
                    for (let i = 0; i < stream.partitions; i++) {
                        streamKeys.push(getKeyFromStream(stream.id, i))
                    }
                })
                this._setStreams(streamKeys)
                return undefined
            })
    }

    _setStreams(streamKeys) {
        const oldKeys = this.streams
        const newKeys = new Set(streamKeys)
        const added = new Set([...newKeys].filter((x) => !oldKeys.has(x)))
        const removed = new Set([...oldKeys].filter((x) => !newKeys.has(x)))
        this.streams = newKeys
        this.listeners.forEach((listener) => {
            added.forEach((key) => listener.onStreamAdded(getStreamFromKey(key)))
            removed.forEach((key) => listener.onStreamRemoved(getStreamFromKey(key)))
        })
    }

    cleanup() {
        this._stopPoller = true
        if (this._poller !== undefined) {
            clearTimeout(this._poller)
        }
    }
}
