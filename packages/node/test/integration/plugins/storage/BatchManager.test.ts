import { until } from '@streamr/utils'
import { Client, types as cassandraTypes } from 'cassandra-driver'
import { InsertRecord } from '../../../../src/plugins/storage/Batch'
import { BatchManager } from '../../../../src/plugins/storage/BatchManager'
import { BucketId } from '../../../../src/plugins/storage/Bucket'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { randomUserId } from '@streamr/test-utils'

const { TimeUuid } = cassandraTypes

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

function buildRecord(streamId: string, partition: number, timestamp: number, sequenceNo: number): InsertRecord {
    return {
        streamId,
        partition,
        timestamp,
        sequenceNo,
        publisherId: randomUserId(),
        msgChainId: 'msgChainId',
        payload: Buffer.from(new Uint8Array([1, 2]))
    }
}

describe('BatchManager', () => {
    let batchManager: BatchManager
    let streamId: string
    let cassandraClient: Client
    let streamIdx = 1
    let bucketId: BucketId

    beforeEach(async () => {
        cassandraClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace
        })

        await cassandraClient.connect()
        batchManager = new BatchManager(cassandraClient, {
            batchMaxSize: 10000,
            batchMaxRecordCount: 10,
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
        let msg = buildRecord(streamId, 0, (i + 1) * 1000, i)
        batchManager.store(bucketId, msg)

        expect(Object.values(batchManager.batches)).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)

        for (i = 1; i < 11; i++) {
            msg = buildRecord(streamId, 0, (i + 1) * 1000, i)
            batchManager.store(bucketId, msg)
        }

        expect(Object.values(batchManager.batches)).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)

        expect(Object.values(batchManager.batches)[0].records).toHaveLength(1)
        expect(Object.values(batchManager.pendingBatches)[0].records).toHaveLength(10)
    })

    test('pendingBatches are inserted', (done) => {
        const msg = buildRecord(streamId, 0, 1000, 0)
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]

        batch.on('locked', () => {
            expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)
            expect(Object.values(batchManager.pendingBatches)[0].records).toHaveLength(1)
        })

        batch.on('inserted', async () => {
            const result = await cassandraClient.execute(
                'SELECT * FROM stream_data WHERE stream_id = ? ALLOW FILTERING',
                [streamId]
            )

            expect(result.rows.length).toEqual(1)
            done()
        })

        batch.lock()
    })

    test('batch emits states: locked => pending => inserted', (done) => {
        const msg = buildRecord(streamId, 0, 1000, 0)
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
        const msg = buildRecord(streamId, 0, 1000, 0)
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]
        expect(batch.retries).toEqual(0)

        const mockBatch = jest.fn().mockImplementation(() => {
            throw new Error('Throw not inserted')
        })
        batchManager.cassandraClient.batch = mockBatch

        await until(() => batch.retries === 1)

        expect(mockBatch).toHaveBeenCalledTimes(1)
        expect(batch.retries).toEqual(1)

        jest.restoreAllMocks()
    })

    test('drops batch after batch reached maximum retires', async () => {
        batchManager.opts.batchMaxRetries = 2

        const msg = buildRecord(streamId, 0, 1000, 0)
        batchManager.store(bucketId, msg)

        const batch = batchManager.batches[bucketId]

        const mockBatch = jest.fn().mockImplementation(() => {
            throw new Error('Throw not inserted')
        })
        batchManager.cassandraClient.batch = mockBatch

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)
        expect(batch.reachedMaxRetries()).toBeFalsy()

        await until(() => batch.retries === 1)

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(1)
        expect(batch.reachedMaxRetries()).toBeFalsy()

        await until(() => batch.retries === 2)

        expect(Object.values(batchManager.pendingBatches)).toHaveLength(0)
        expect(batch.reachedMaxRetries()).toBeTruthy()
    })
})
