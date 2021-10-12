import { Stream } from './Stream'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

function getStreamLookupKey(streamId: string, streamPartition: number) {
    return `${streamId}::${streamPartition}`
}

export class StreamStateManager<C> {
    private streams: Record<string,Stream<C>> = {}
    private timeouts: Record<string,NodeJS.Timeout> = {}

    getOrCreate(streamId: string, streamPartition: number, name = ''): Stream<C> {
        const stream = this.get(streamId, streamPartition)
        if (stream) {
            return stream
        }
        return this.create(streamId, streamPartition, name)
    }

    get(streamId: string, streamPartition: number): Stream<C> {
        return this.streams[getStreamLookupKey(streamId, streamPartition)]
    }

    getByName(name: string): Stream<C>|null {
        const streamId = Object.keys(this.streams)
            .find((key) => { return this.streams[key].getName() === name })
        return streamId ? this.streams[streamId] : null
    }

    /**
     * Creates and returns a Stream object, holding the Stream subscription state.
     * */
    create(streamId: string, streamPartition: number, name = ''): Stream<C> {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const key = getStreamLookupKey(streamId, streamPartition)
        if (this.streams[key]) {
            throw new Error(`stream already exists for ${key}`)
        }

        const stream = new Stream<C>(streamId, streamPartition, name)
        this.streams[key] = stream

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
        this.timeouts[key] = setTimeout(() => {
            if (stream.state !== 'subscribed') {
                logger.debug('Stream "%s:%d" never subscribed, cleaning..', streamId, streamPartition)
                this.delete(streamId, streamPartition)
            }
        }, 60 * 1000)

        logger.debug('Stream object "%s" created', stream.toString())
        return stream
    }

    delete(streamId: string, streamPartition: number): void {
        if (streamId == null || streamPartition == null) {
            throw new Error('streamId or streamPartition not given!')
        }

        const stream = this.get(streamId, streamPartition)
        if (stream) {
            const key = getStreamLookupKey(streamId, streamPartition)
            clearTimeout(this.timeouts[key])
            delete this.timeouts[key]
            delete this.streams[key]
        }

        logger.debug('Stream object "%s" deleted', stream.toString())
    }

    close(): void {
        Object.values(this.timeouts).forEach((timeout) => {
            clearTimeout(timeout)
        })
    }
}
