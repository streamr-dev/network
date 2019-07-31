const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const MicroBatchingStrategy = require('../../src/MicroBatchingStrategy')

jest.useFakeTimers()

const BASE_COMMIT_INTERVAL = 1000

function buildMsg(streamId, streamPartition, timestamp, sequenceNumber) {
    return StreamMessage.create(
        [streamId, streamPartition, timestamp, sequenceNumber, 'publisherId', 'msgChainId'],
        null,
        StreamMessage.CONTENT_TYPES.MESSAGE,
        StreamMessage.ENCRYPTION_TYPES.NONE,
        {
            hello: 'world',
            this: 'is some content',
        },
        StreamMessage.SIGNATURE_TYPES.NONE,
        null,
    )
}

function msgToStreamIdAndPartition(streamMessage) {
    return `${streamMessage.getStreamId()}::${streamMessage.getStreamPartition()}`
}

describe('MicroBatchingStrategy', () => {
    let insertFn
    let microBatchingStrategy

    beforeEach(() => {
        const messageSize = Buffer.from(buildMsg('streamId', 0, 0, 0).serialize()).length
        insertFn = jest.fn()
        microBatchingStrategy = new MicroBatchingStrategy({
            insertFn,
            baseCommitIntervalInMs: BASE_COMMIT_INTERVAL,
            maxFailMultiplier: 16,
            doNotGrowBatchAfterBytes: messageSize * 10,
            logErrors: false,
        })
    })

    describe('single batch scenario', () => {
        beforeEach(() => {
            microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 1))
        })

        test('insertFn(batch) is not invoked before baseCommitIntervalInMs', () => {
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).not.toHaveBeenCalled()
        })

        test('insertFn(batch) is invoked after baseCommitIntervalInMs', () => {
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(1)
            expect(insertFn).toHaveBeenNthCalledWith(1, [
                buildMsg('streamId', 0, 0, 0),
                buildMsg('streamId', 0, 1, 0),
                buildMsg('streamId', 0, 2, 0),
                buildMsg('streamId', 0, 2, 1)
            ])
        })
    })

    describe('forming batches', () => {
        test('a batch has a maximum size; new batches are set up as existing ones fill up', () => {
            for (let i = 0; i <= 23; ++i) {
                microBatchingStrategy.store(buildMsg('streamId', 0, i, 0))
            }

            jest.runAllTimers()

            expect(insertFn).toHaveBeenCalledTimes(3)
            expect(insertFn.mock.calls[0][0].map((msg) => msg.getTimestamp())).toEqual([
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9
            ])
            expect(insertFn.mock.calls[1][0].map((msg) => msg.getTimestamp())).toEqual([
                10, 11, 12, 13, 14, 15, 16, 17, 18, 19
            ])
            expect(insertFn.mock.calls[2][0].map((msg) => msg.getTimestamp())).toEqual([
                20, 21, 22, 23
            ])
        })

        test('messages are batched based on streamId and streamPartition', () => {
            microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 0))
            microBatchingStrategy.store(buildMsg('streamId', 1, 3, 0))
            microBatchingStrategy.store(buildMsg('streamId', 1, 0, 0))
            microBatchingStrategy.store(buildMsg('differentStreamId', 0, 0, 0))

            jest.runAllTimers()

            expect(insertFn).toHaveBeenCalledTimes(3)
            expect(insertFn.mock.calls[0][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId::0', 'streamId::0', 'streamId::0'
            ])
            expect(insertFn.mock.calls[1][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId::1', 'streamId::1'
            ])
            expect(insertFn.mock.calls[2][0].map(msgToStreamIdAndPartition)).toEqual([
                'differentStreamId::0'
            ])
        })

        test('batches have separate timers', () => {
            microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 0))

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL / 2)

            for (let i = 10; i <= 100; i += 10) {
                microBatchingStrategy.store(buildMsg('streamId', 0, i, 0))
            }

            microBatchingStrategy.store(buildMsg('streamId', 1, 10, 0))
            microBatchingStrategy.store(buildMsg('streamId', 1, 20, 0))
            microBatchingStrategy.store(buildMsg('streamId', 1, 30, 0))

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL / 2)
            expect(insertFn).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL / 2)
            expect(insertFn).toHaveBeenCalledTimes(3)

            expect(insertFn.mock.calls[0][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId::0', 'streamId::0', 'streamId::0', 'streamId::0', 'streamId::0',
                'streamId::0', 'streamId::0', 'streamId::0', 'streamId::0', 'streamId::0',
            ])
            expect(insertFn.mock.calls[1][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId::0', 'streamId::0', 'streamId::0'
            ])
            expect(insertFn.mock.calls[2][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId::1', 'streamId::1', 'streamId::1'
            ])
        })
    })

    describe('retry logic', () => {
        test('if insertFn throws, retry in powers of two seconds up to maxFailMultiplier until success', async () => {
            insertFn
                .mockRejectedValueOnce(new Error('error')) // 2
                .mockRejectedValueOnce(new Error('error')) // 4
                .mockRejectedValueOnce(new Error('error')) // 8
                .mockRejectedValueOnce(new Error('error')) // 16
                .mockRejectedValueOnce(new Error('error')) // 16
                .mockResolvedValueOnce('success')

            microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 0))

            // Fail 1st call
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(1)
            await new Promise((resolve) => setImmediate(resolve))

            // Fail 2nd call
            jest.advanceTimersByTime(2 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(1)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(2)
            await new Promise((resolve) => setImmediate(resolve))

            // Fail 3rd call
            jest.advanceTimersByTime(4 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(2)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(3)
            await new Promise((resolve) => setImmediate(resolve))

            // Fail 4th call
            jest.advanceTimersByTime(8 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(3)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(4)
            await new Promise((resolve) => setImmediate(resolve))

            // Fail 5th call
            jest.advanceTimersByTime(16 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(4)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(5)
            await new Promise((resolve) => setImmediate(resolve))

            // Success 6th call
            jest.advanceTimersByTime(16 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(5)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(6)
            await new Promise((resolve) => setImmediate(resolve))

            // No more retries
            jest.runAllTimers()
            expect(insertFn).toHaveBeenCalledTimes(6)
        })

        test('a successful insertFn resets the retry multiplier', async () => {
            insertFn
                .mockRejectedValueOnce(new Error('error')) // 2
                .mockRejectedValueOnce(new Error('error')) // 4
                .mockResolvedValueOnce('success')
                .mockResolvedValueOnce('success')

            microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId', 0, 2, 0))

            // Fail 1st call
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(1)
            await new Promise((resolve) => setImmediate(resolve))

            // Fail 2nd call
            jest.advanceTimersByTime(2 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(1)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(2)
            await new Promise((resolve) => setImmediate(resolve))

            // Success 3rd call
            jest.advanceTimersByTime(4 * BASE_COMMIT_INTERVAL - 1)
            expect(insertFn).toHaveBeenCalledTimes(2)
            jest.advanceTimersByTime(1)
            expect(insertFn).toHaveBeenCalledTimes(3)
            await new Promise((resolve) => setImmediate(resolve))

            microBatchingStrategy.store(buildMsg('streamId', 0, 3, 0))

            // Success 4th call
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(4)
            await new Promise((resolve) => setImmediate(resolve))

            microBatchingStrategy.store(buildMsg('streamId', 0, 4, 0))

            // Success 5th call
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(5)
        })

        test('batches share retry multiplier', async () => {
            insertFn.mockRejectedValue(new Error('error'))

            microBatchingStrategy.store(buildMsg('streamId-1', 0, 0, 0))
            microBatchingStrategy.store(buildMsg('streamId-1', 0, 1, 0))
            microBatchingStrategy.store(buildMsg('streamId-1', 0, 2, 0))

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(1)
            await new Promise((resolve) => setImmediate(resolve))

            microBatchingStrategy.store(buildMsg('streamId-2', 0, 3, 0))
            microBatchingStrategy.store(buildMsg('streamId-2', 0, 4, 0))

            microBatchingStrategy.store(buildMsg('streamId-3', 0, 5, 0))
            microBatchingStrategy.store(buildMsg('streamId-3', 0, 6, 0))

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            expect(insertFn).toHaveBeenCalledTimes(4) // original + retry + streamId-2 + streamId-3
            expect(insertFn.mock.calls[2][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId-2::0', 'streamId-2::0'
            ])
            expect(insertFn.mock.calls[3][0].map(msgToStreamIdAndPartition)).toEqual([
                'streamId-3::0', 'streamId-3::0'
            ])
        })
    })

    describe('returned promise from store(msg)', () => {
        test('is pending until batch is successfully inserted', async () => {
            insertFn.mockRejectedValueOnce(new Error('error')) // 2

            let p1Done = false
            let p2Done = false

            const p1 = microBatchingStrategy.store(buildMsg('streamId', 0, 0, 0))
            const p2 = microBatchingStrategy.store(buildMsg('streamId', 0, 1, 0))

            p1.then(() => {
                p1Done = true
            })
            p2.then(() => {
                p2Done = true
            })

            expect(p1Done).toEqual(false)
            expect(p2Done).toEqual(false)

            // Fail 1st call
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL)
            await new Promise((resolve) => setImmediate(resolve))
            expect(p1Done).toEqual(false)
            expect(p2Done).toEqual(false)

            // Success 2nd call
            jest.advanceTimersByTime(2 * BASE_COMMIT_INTERVAL)
            await new Promise((resolve) => setImmediate(resolve))
            expect(p1Done).toEqual(true)
            expect(p2Done).toEqual(true)
        })

        test('is batch-specific', async () => {
            let p1Done = false
            let p2Done = false

            const p1 = microBatchingStrategy.store(buildMsg('streamId-1', 0, 0, 0))
            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL / 2)
            const p2 = microBatchingStrategy.store(buildMsg('streamId-2', 0, 1, 0))

            p1.then(() => {
                p1Done = true
            })
            p2.then(() => {
                p2Done = true
            })

            jest.advanceTimersByTime(BASE_COMMIT_INTERVAL / 2)
            await new Promise((resolve) => setImmediate(resolve))
            expect(p1Done).toEqual(true)
            expect(p2Done).toEqual(false)

            jest.runAllTimers()
            await new Promise((resolve) => setImmediate(resolve))
            expect(p1Done).toEqual(true)
            expect(p2Done).toEqual(true)
        })
    })
})
