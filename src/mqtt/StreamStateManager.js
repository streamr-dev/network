const debug = require('debug')('streamr:StreamStateManager')
const Stream = require('./Stream')

function getStreamLookupKey(streamId, streamPartition) {
    return `${streamId}::${streamPartition}`
}

module.exports = class StreamStateManager {
    constructor() {
        this._streams = {}
        this._timeouts = {}
    }

    getOrCreate(name, streamId, streamPartition) {
        const stream = this.get(streamId, streamPartition)
        if (stream) {
            return stream
        }
        return this.create(name, streamId, streamPartition)
    }

    get(streamId, streamPartition) {
        return this._streams[getStreamLookupKey(streamId, streamPartition)]
    }

    /**
     * Creates and returns a Stream object, holding the Stream subscription state.
     * */
    create(name, streamId, streamPartition) {
        if (name == null || streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const key = getStreamLookupKey(streamId, streamPartition)
        if (this._streams[key]) {
            throw new Error(`stream already exists for ${key}`)
        }

        const stream = new Stream(streamId, name, streamPartition)
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
                debug('Stream "%s:%d" never subscribed, cleaning..', streamId, streamPartition)
                this.delete(streamId, streamPartition)
            }
        }, 60 * 1000)

        debug('Stream object "%s" created', stream.toString())
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

        debug('Stream object "%s" deleted', stream.toString())
    }

    close() {
        Object.values(this._timeouts).forEach((timeout) => clearTimeout(timeout))
    }
}
