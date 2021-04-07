const cassandra = require('cassandra-driver')
const { TimeUuid } = require('cassandra-driver').types
const { StreamMessage, MessageIDStrict } = require('streamr-network').Protocol.MessageLayer
const { waitForCondition } = require('streamr-test-utils')

const { STREAMR_DOCKER_DEV_HOST } = require('../../utils')
const BatchManager = require('../../../src/storage/BatchManager')

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

function buildMsg(
    streamId,
    streamPartition,
    timestamp,
    sequenceNumber,
    publisherId = 'publisher',
    msgChainId = '1',
    content = {}
) {
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId),
        content: JSON.stringify(content)
    })
}

describe('BatchManager', () => {
    let batchManager
    let streamId
    let cassandraClient
    let streamIdx = 1
    let bucketId

    beforeEach(async () => {
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })

        await cassandraClient.connect()
        batchManager = new BatchManager(cassandraClient, {
            logErrors: false,
            batchMaxSize: 10000,
            batchMaxRecords: 10,
            batchCloseTimeout: 1000,
            batchMaxRetries: 64
        })

        streamId = `stream-id-${Date.now()}-${streamIdx}`
        streamIdx += 1
        bucketId = TimeUuid.fromDate(new Date()).toString()
    })

    afterEach(async () => {
        batchManager.stop()
        await cassandraClient.shutdown()
    })

    test('move full batch to pendingBatches', () => {
        expect(Object.values(batchManager.batches)).toHaveLength(0)
        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)

        let i = 0
        let msg = buildMsg(streamId, 0, (i + 1) * 1000, i, 'publisher1')
        batchManager.store(bucketId, msg)

        expect(Object.values(batchManager.batches)).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)

        for (i = 1; i < 11; i++) {
            msg = buildMsg(streamId, 0, (i + 1) * 1000, i, 'publisher1')
            batchManager.store(bucketId, msg)
        }

        expect(Object.values(batchManager.batches)).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)

        expect(Object.values(batchManager.batches)[0].streamMessages).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)[0].streamMessages).toHaveLength(10)
    })

    test('pendingBatches are inserted', (done) => {
        const msg = buildMsg(streamId, 0, 1000, 0, 'publisher1')
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]

        batch.on('locked', () => {
            expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)
            expect(Object.values(batchManager.pendingBatches)[0].streamMessages).toHaveLength(1)
        })

        batch.on('inserted', async () => {
            const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [
                streamId
            ])

            expect(result.rows.length).toEqual(1)
            done()
        })

        batch.lock()
    })

    test('batch emits states: locked => pending => inserted', (done) => {
        const msg = buildMsg(streamId, 0, 1000, 0, 'publisher1')
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]

        batch.on('locked', () => {
            batch.scheduleInsert()
        })

        batch.on('pending', async () => {
            batch.on('inserted', () => done())
        })
    })

    test('when failed to insert, increase retry and try again after timeout', async () => {
        const msg = buildMsg(streamId, 0, 1000, 0, 'publisher1')
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]
        expect(batch.retries).toEqual(0)

        const mockBatch = jest.fn().mockImplementation(() => {
            throw Error('Throw not inserted')
        })
        batchManager.cassandraClient.batch = mockBatch

        await waitForCondition(() => batch.retries === 1)

        expect(mockBatch).toBeCalledTimes(1)
        expect(batch.retries).toEqual(1)

        jest.restoreAllMocks()
    })

    test('drops batch after batch reached maximum retires', async () => {
        batchManager.opts.batchMaxRetries = 2

        const msg = buildMsg(streamId, 0, 1000, 0, 'publisher1')
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]

        const mockBatch = jest.fn().mockImplementation(() => {
            throw Error('Throw not inserted')
        })
        batchManager.cassandraClient.batch = mockBatch

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)
        expect(batch.reachedMaxRetries()).toBeFalsy()

        await waitForCondition(() => batch.retries === 1)

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)
        expect(batch.reachedMaxRetries()).toBeFalsy()

        await waitForCondition(() => batch.retries === 2)

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)
        expect(batch.reachedMaxRetries()).toBeTruthy()
    })
})
