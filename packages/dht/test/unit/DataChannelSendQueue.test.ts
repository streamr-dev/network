import { DataChannelSendQueue } from '../../src/connection/webrtc/DataChannelSendQueue'

const HIGH = 1000

const msg = (byteLength: number, tag: number): Uint8Array => {
    const data = new Uint8Array(byteLength)
    data[0] = tag
    return data
}

const tags = (sent: Uint8Array[]): number[] => sent.map((data) => data[0])

describe('DataChannelSendQueue', () => {

    let bufferedAmount: number
    let sent: Uint8Array[]
    let now: number
    let queue: DataChannelSendQueue

    beforeEach(() => {
        bufferedAmount = 0
        sent = []
        now = 100_000
        queue = new DataChannelSendQueue({
            bufferedAmount: () => bufferedAmount,
            send: (data: Uint8Array) => {
                sent.push(data)
                bufferedAmount += data.byteLength
            }
        }, { bufferThresholdHigh: HIGH, now: () => now })
    })

    describe('send', () => {

        it('sends directly while the channel is at or below the high watermark', () => {
            queue.send(msg(100, 1))
            bufferedAmount = HIGH   // exactly at the watermark still sends directly
            queue.send(msg(100, 2))
            expect(tags(sent)).toEqual([1, 2])
            expect(queue.size()).toBe(0)
        })

        it('queues above the high watermark and keeps queuing until flushed', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1))
            queue.send(msg(100, 2))
            expect(sent).toEqual([])
            expect(queue.size()).toBe(2)
        })

        it('flush() drains FIFO and stops when the channel fills up again', () => {
            bufferedAmount = HIGH + 1
            for (let i = 1; i <= 5; i++) {
                queue.send(msg(400, i))
            }
            bufferedAmount = 0
            queue.flush()
            // 400 + 400 + 400 = 1200 >= HIGH after the third send
            expect(tags(sent)).toEqual([1, 2, 3])
            expect(queue.size()).toBe(2)
            bufferedAmount = 0
            queue.flush()
            expect(tags(sent)).toEqual([1, 2, 3, 4, 5])
            expect(queue.size()).toBe(0)
        })

        it('never lets a new message bypass a non-empty backlog (FIFO guard)', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1))
            queue.send(msg(100, 2))
            // the channel buffer momentarily drops to zero: the old code would
            // have sent message 3 directly, ahead of 1 and 2
            bufferedAmount = 0
            queue.send(msg(100, 3))
            expect(tags(sent)).toEqual([1, 2, 3])
        })

        it('keeps the backlog ordered when the channel fills mid-flush', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(600, 1))
            queue.send(msg(600, 2))
            bufferedAmount = 0
            queue.send(msg(600, 3))
            // 600 sent (1), then bufferedAmount 600 < HIGH sends 2 -> 1200 stops
            expect(tags(sent)).toEqual([1, 2])
            expect(queue.size()).toBe(1)
            bufferedAmount = 0
            queue.flush()
            expect(tags(sent)).toEqual([1, 2, 3])
        })
    })

    describe('enqueue / clear', () => {

        it('enqueue() holds messages until flush()', () => {
            queue.enqueue(msg(100, 1))
            queue.enqueue(msg(100, 2))
            expect(sent).toEqual([])
            queue.flush()
            expect(tags(sent)).toEqual([1, 2])
        })

        it('clear() drops the backlog and zeroes the counters', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1))
            queue.clear()
            expect(queue.size()).toBe(0)
            const statistics = queue.getStatistics()
            expect(statistics.queuedMessages).toBe(0)
            expect(statistics.queuedBytes).toBe(0)
            expect(statistics.oldestQueuedMs).toBe(0)
        })
    })

    describe('getStatistics', () => {

        it('reports an empty queue', () => {
            bufferedAmount = 42
            expect(queue.getStatistics()).toEqual({
                bufferedAmount: 42,
                queuedMessages: 0,
                queuedBytes: 0,
                oldestQueuedMs: 0,
                offeredBytesPerSecond: 0,
                sentBytesPerSecond: 0,
                expiredMessages: 0,
                purgedMessages: 0
            })
        })

        it('reports backlog size, age and offered vs sent rates', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(300, 1))
            now += 200
            queue.send(msg(200, 2))
            now += 100
            let statistics = queue.getStatistics()
            expect(statistics.queuedMessages).toBe(2)
            expect(statistics.queuedBytes).toBe(500)
            expect(statistics.oldestQueuedMs).toBe(300)
            expect(statistics.offeredBytesPerSecond).toBe(500)
            expect(statistics.sentBytesPerSecond).toBe(0)

            bufferedAmount = 0
            queue.flush()
            statistics = queue.getStatistics()
            expect(statistics.queuedMessages).toBe(0)
            expect(statistics.queuedBytes).toBe(0)
            expect(statistics.oldestQueuedMs).toBe(0)
            expect(statistics.sentBytesPerSecond).toBe(500)
            expect(statistics.bufferedAmount).toBe(500)
        })

        it('counts direct sends as both offered and sent', () => {
            queue.send(msg(250, 1))
            const statistics = queue.getStatistics()
            expect(statistics.offeredBytesPerSecond).toBe(250)
            expect(statistics.sentBytesPerSecond).toBe(250)
        })
    })

    describe('expiry (SendQueueHint.maxQueueAgeMs)', () => {

        it('drops a message that waited too long instead of sending it, keeps the rest in order', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1), { maxQueueAgeMs: 2000 })
            queue.send(msg(100, 2))                              // no hint: always delivered
            queue.send(msg(100, 3), { maxQueueAgeMs: 2000 })
            now += 1500
            queue.send(msg(100, 4), { maxQueueAgeMs: 2000 })
            now += 1000    // 1 and 3 are 2.5 s old, 4 is 1 s old
            bufferedAmount = 0
            queue.flush()
            expect(tags(sent)).toEqual([2, 4])
            expect(queue.size()).toBe(0)
            expect(queue.getStatistics().expiredMessages).toBe(2)
            expect(queue.getStatistics().queuedBytes).toBe(0)
        })

        it('a message without the hint is delivered however long it waited', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1))
            now += 60_000
            bufferedAmount = 0
            queue.flush()
            expect(tags(sent)).toEqual([1])
            expect(queue.getStatistics().expiredMessages).toBe(0)
        })

        it('a stuck channel does not let expired messages pile up: the next send sweeps them', () => {
            bufferedAmount = HIGH + 1
            for (let i = 0; i < 50; i++) {
                queue.send(msg(100, i), { maxQueueAgeMs: 2000 })
                now += 100
            }
            // 5 s of sends into a channel that never drained: only the last ~2 s remain
            expect(queue.size()).toBeLessThanOrEqual(23)
            expect(queue.getStatistics().oldestQueuedMs).toBeLessThanOrEqual(2300)
            expect(queue.getStatistics().expiredMessages).toBeGreaterThanOrEqual(27)
            expect(sent).toEqual([])
            // what is left still goes out in order once the channel moves
            while (queue.size() > 0) {
                bufferedAmount = 0
                queue.flush()
            }
            const out = tags(sent)
            expect(out).toEqual([...out].sort((a, b) => a - b))
            expect(out[out.length - 1]).toBe(49)
        })
    })

    describe('purge (SendQueueHint.purgeKey)', () => {

        it('withdraws only the messages queued under the key, keeping the order of the rest', () => {
            bufferedAmount = HIGH + 1
            queue.send(msg(100, 1), { purgeKey: 'stream#0' })
            queue.send(msg(100, 2), { purgeKey: 'stream#3' })
            queue.send(msg(100, 3))
            queue.send(msg(100, 4), { purgeKey: 'stream#0', maxQueueAgeMs: 2000 })
            queue.send(msg(100, 5), { purgeKey: 'stream#3' })
            expect(queue.purge('stream#0')).toBe(2)
            expect(queue.purge('stream#0')).toBe(0)
            expect(queue.size()).toBe(3)
            expect(queue.getStatistics().queuedBytes).toBe(300)
            expect(queue.getStatistics().purgedMessages).toBe(2)
            bufferedAmount = 0
            queue.flush()
            expect(tags(sent)).toEqual([2, 3, 5])
        })

        it('a message sent directly was never queued, so there is nothing to purge', () => {
            queue.send(msg(100, 1), { purgeKey: 'stream#0' })
            expect(tags(sent)).toEqual([1])
            expect(queue.purge('stream#0')).toBe(0)
        })
    })
})
