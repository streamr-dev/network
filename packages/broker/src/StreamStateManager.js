const logger = require('./helpers/logger')('streamr:StreamStateManager')
const Stream = require('./Stream')

function getStreamLookupKey(streamId, streamPartition) {
    return `${streamId}::${streamPartition}`
}

module.exports = class StreamStateManager {
    constructor(msgHandler, gapHander) {
        this._streams = {}
        this._timeouts = {}
        this.msgHandler = msgHandler
        this.gapHandler = gapHander
    }

    getOrCreate(streamId, streamPartition, name = '') {
        const stream = this.get(streamId, streamPartition)
        if (stream) {
            return stream
        }
        return this.create(streamId, streamPartition, name)
    }

    get(streamId, streamPartition) {
        return this._streams[getStreamLookupKey(streamId, streamPartition)]
    }

    getByName(name) {
        const streamId = Object.keys(this._streams)
            .find((key) => { return this._streams[key].getName() === name })
        return streamId ? this._streams[streamId] : null
    }

    /**
     * Creates and returns a Stream object, holding the Stream subscription state.
     * */
    create(streamId, streamPartition, name = '') {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const key = getStreamLookupKey(streamId, streamPartition)
        if (this._streams[key]) {
            throw new Error(`stream already exists for ${key}`)
        }

        const stream = new Stream(streamId, streamPartition, name, this.msgHandler, this.gapHandler)
        this._streams[key] = stream

        /*
         * In normal conditions, the Stream object is cleaned when no more
         * clients are subscribed to it.
         *
         * However, ill-behaving clients could just ask for resends on a Stream
         * and never subscribe to it, which would lead to leaking memory.
         * To prevent this, clean up the Stream object if it doesn't
         * end up in subscribed state within one minute (for example, ill-behaving)
         * clients only asking for resends and never subscribing.
         */
        this._timeouts[key] = setTimeout(() => {
            if (stream.state !== 'subscribed') {
                logger.debug('Stream "%s:%d" never subscribed, cleaning..', streamId, streamPartition)
                this.delete(streamId, streamPartition)
            }
        }, 60 * 1000)

        logger.debug('Stream object "%s" created', stream.toString())
        return stream
    }

    delete(streamId, streamPartition) {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = this.get(streamId, streamPartition)
        if (stream) {
            const key = getStreamLookupKey(streamId, streamPartition)
            clearTimeout(this._timeouts[key])
            delete this._timeouts[key]
            delete this._streams[key]
        }

        logger.debug('Stream object "%s" deleted', stream.toString())
    }

    close() {
        Object.values(this._streams).forEach((stream) => {
            stream.clearOrderingUtil()
        })
        Object.values(this._timeouts).forEach((timeout) => {
            clearTimeout(timeout)
        })
    }
}
