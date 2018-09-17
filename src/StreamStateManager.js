const events = require('events')
const debug = require('debug')('streamr:StreamStateManager')
const Stream = require('./Stream')

function getStreamLookupKey(streamId, streamPartition) {
    return `${streamId}-${streamPartition}`
}

module.exports = class StreamStateManager extends events.EventEmitter {
    constructor() {
        super()
        this._streams = {}
    }

    getStreamObject(streamId, streamPartition) {
        return this._streams[getStreamLookupKey(streamId, streamPartition)]
    }

    /**
     * Creates and returns a Stream object, holding the Stream subscription state.
     *
     * In normal conditions, the Stream object is cleaned when no more
     * clients are subscribed to it.
     *
     * However, ill-behaving clients could just ask for resends on a Stream
     * and never subscribe to it, which would lead to leaking memory.
     * To prevent this, clean up the Stream object if it doesn't
     * end up in subscribed state within one minute (for example, ill-behaving)
     * clients only asking for resends and never subscribing.
     * */
    createStreamObject(streamId, streamPartition) {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = new Stream(streamId, streamPartition, 'init')
        this._streams[getStreamLookupKey(streamId, streamPartition)] = stream

        stream.stateTimeout = setTimeout(() => {
            if (stream.state !== 'subscribed') {
                debug('Stream %s never got to subscribed state, cleaning..', streamId)
                this.deleteStreamObject(streamId, streamPartition)
            }
        }, 60 * 1000)

        debug('Stream object created: %o', stream)
        return stream
    }

    deleteStreamObject(streamId, streamPartition) {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = this.getStreamObject(streamId, streamPartition)
        debug('Stream object deleted: %o', stream)
        if (stream) {
            clearTimeout(stream.stateTimeout)
            delete this._streams[getStreamLookupKey(streamId, streamPartition)]
        }
    }
}
