import { DataChannelSet } from '../../src/connection/webrtc/DataChannelSet'
import { DataChannelSendAdapter } from '../../src/connection/webrtc/DataChannelSendQueue'

const HIGH = 1000
const MEDIA_HIGH = 500

const msg = (byteLength: number, tag: number): Uint8Array => {
    const data = new Uint8Array(byteLength)
    data[0] = tag
    return data
}
const tags = (sent: Uint8Array[]): number[] => sent.map((data) => data[0])

class FakeChannel implements DataChannelSendAdapter {
    public buffered = 0
    public sent: Uint8Array[] = []
    public throwOnSend = false
    bufferedAmount(): number {
        return this.buffered
    }
    send(data: Uint8Array): void {
        if (this.throwOnSend) {
            throw new Error('InvalidStateError: channel closing')
        }
        this.sent.push(data)
        this.buffered += data.byteLength
    }
}

describe('DataChannelSet', () => {

    let reliable: FakeChannel
    let media: FakeChannel
    let now: number
    let set: DataChannelSet

    beforeEach(() => {
        reliable = new FakeChannel()
        media = new FakeChannel()
        now = 100_000
        set = new DataChannelSet(
            { reliable, media },
            { bufferThresholdHigh: HIGH, mediaBufferThresholdHigh: MEDIA_HIGH, now: () => now }
        )
        set.setOpen('reliable', true)
    })

    describe('routing', () => {

        it('unhinted and reliable-hinted messages go to the reliable channel', () => {
            set.setOpen('media', true)
            set.send(msg(10, 1))
            set.send(msg(10, 2), { channel: 'reliable' })
            set.send(msg(10, 3), { purgeKey: 'p' })
            expect(tags(reliable.sent)).toEqual([1, 2, 3])
            expect(media.sent).toEqual([])
        })

        it('media-hinted messages go to the media channel while it is open', () => {
            set.setOpen('media', true)
            set.send(msg(10, 1), { channel: 'media' })
            set.send(msg(10, 2), { channel: 'media', maxQueueAgeMs: 100 })
            expect(tags(media.sent)).toEqual([1, 2])
            expect(reliable.sent).toEqual([])
        })

        it('media-hinted messages fall back to the reliable channel without an open media channel', () => {
            set.send(msg(10, 1), { channel: 'media' })
            expect(tags(reliable.sent)).toEqual([1])
            set.setOpen('media', true)
            set.send(msg(10, 2), { channel: 'media' })
            set.detachMedia()
            set.send(msg(10, 3), { channel: 'media' })
            expect(tags(media.sent)).toEqual([2])
            expect(tags(reliable.sent)).toEqual([1, 3])
        })

        it('enqueue (channel not yet open) holds messages on the reliable queue and flushes them in order', () => {
            set.enqueue(msg(10, 1), { channel: 'media' })
            set.enqueue(msg(10, 2))
            expect(reliable.sent).toEqual([])
            set.flush('reliable')
            expect(tags(reliable.sent)).toEqual([1, 2])
        })
    })

    describe('independent backpressure', () => {

        it('each channel has its own FIFO guard and watermark', () => {
            set.setOpen('media', true)
            media.buffered = MEDIA_HIGH + 1
            set.send(msg(10, 1), { channel: 'media' })     // queued (media above its watermark)
            set.send(msg(10, 2))                           // reliable still sends directly
            set.send(msg(10, 3), { channel: 'media' })     // queued behind 1 (FIFO guard)
            expect(media.sent).toEqual([])
            expect(tags(reliable.sent)).toEqual([2])
            media.buffered = 0
            set.flush('media')
            expect(tags(media.sent)).toEqual([1, 3])
        })

        it('detaching the media channel drops its backlog and counts it as purged', () => {
            set.setOpen('media', true)
            media.buffered = MEDIA_HIGH + 1
            set.send(msg(10, 1), { channel: 'media' })
            set.send(msg(10, 2), { channel: 'media' })
            set.detachMedia()
            media.buffered = 0
            set.flush('media')
            expect(media.sent).toEqual([])
            const stats = set.getStatistics()
            expect(stats.channels?.media?.purgedMessages).toBe(2)
            expect(stats.purgedMessages).toBe(2)
            expect(stats.queuedMessages).toBe(0)
        })

        it('purge and clear cover both queues', () => {
            set.setOpen('media', true)
            reliable.buffered = HIGH + 1
            media.buffered = MEDIA_HIGH + 1
            set.send(msg(10, 1), { purgeKey: 'a' })
            set.send(msg(10, 2), { channel: 'media', purgeKey: 'a' })
            set.send(msg(10, 3), { channel: 'media', purgeKey: 'b' })
            expect(set.purge('a')).toBe(2)
            expect(set.getStatistics().queuedMessages).toBe(1)
            set.clear()
            expect(set.getStatistics().queuedMessages).toBe(0)
        })
    })

    describe('statistics', () => {

        it('is the plain reliable snapshot until a media channel has existed', () => {
            set.send(msg(10, 1))
            const stats = set.getStatistics()
            expect(stats.channels).toBeUndefined()
            expect(stats.bufferedAmount).toBe(10)
        })

        it('sums both channels and keeps the per-channel breakdown', () => {
            set.setOpen('media', true)
            reliable.buffered = HIGH + 1
            media.buffered = MEDIA_HIGH + 1
            set.send(msg(100, 1))
            now += 500
            set.send(msg(200, 2), { channel: 'media' })
            now += 250
            const stats = set.getStatistics()
            expect(stats.queuedMessages).toBe(2)
            expect(stats.queuedBytes).toBe(300)
            expect(stats.bufferedAmount).toBe(HIGH + 1 + MEDIA_HIGH + 1)
            // the oldest queued message is the reliable one (750 ms)
            expect(stats.oldestQueuedMs).toBe(750)
            expect(stats.channels?.reliable.oldestQueuedMs).toBe(750)
            expect(stats.channels?.media?.oldestQueuedMs).toBe(250)
            expect(stats.channels?.media?.queuedBytes).toBe(200)
        })
    })

    it('a media send that throws is dropped without propagating', () => {
        set.setOpen('media', true)
        media.throwOnSend = true
        expect(() => set.send(msg(10, 1), { channel: 'media' })).not.toThrow()
        expect(media.sent).toEqual([])
        // the reliable channel is unaffected
        set.send(msg(10, 2))
        expect(tags(reliable.sent)).toEqual([2])
    })
})
