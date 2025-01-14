import { Wallet } from 'ethers'
import { Client, types as cassandraTypes } from 'cassandra-driver'
import { StreamrClient } from '@streamr/sdk'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { BucketId } from '../../../../src/plugins/storage/Bucket'
import { DeleteExpiredCmd } from '../../../../src/plugins/storage/DeleteExpiredCmd'
import { STREAMR_DOCKER_DEV_HOST, createTestStream, createClient } from '../../../utils'
const { TimeUuid } = cassandraTypes

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const DAY_IN_MS = 1000 * 60 * 60 * 24

jest.setTimeout(30000)

const insertBucket = async (cassandraClient: Client, streamId: string, dateCreate: number) => {
    const bucketId = TimeUuid.fromDate(new Date(dateCreate)).toString()
    const query =
        'INSERT INTO bucket (stream_id, partition, date_create, id, records, size)' + 'VALUES (?, 0, ?, ?, 1, 1)'
    await cassandraClient.execute(query, [streamId, dateCreate, bucketId], {
        prepare: true
    })
    return bucketId
}

const insertData = async (cassandraClient: Client, streamId: string, bucketId: BucketId, ts: number) => {
    const insert =
        'INSERT INTO stream_data ' +
        '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) ' +
        'VALUES (?, 0, ?, ?, 0, ?, ?, ?)'
    await cassandraClient.execute(
        insert,
        [streamId, bucketId, new Date(ts), 'publisherId', 'msgChainId', Buffer.from('{}')],
        {
            prepare: true
        }
    )
}

const checkDBCount = async (cassandraClient: Client, streamId: string) => {
    const countBuckets = 'SELECT COUNT(*) FROM bucket WHERE stream_id = ? AND partition = 0 ALLOW FILTERING'
    const bucketResult = await cassandraClient.execute(countBuckets, [streamId], {
        prepare: true
    })
    const countData = 'SELECT COUNT(*) FROM stream_data WHERE stream_id = ? AND partition = 0 ALLOW FILTERING'
    const messageResult = await cassandraClient.execute(countData, [streamId], {
        prepare: true
    })
    return {
        bucketCount: bucketResult.first().count.low,
        messageCount: messageResult.first().count.low
    }
}

describe('DeleteExpiredCmd', () => {
    let client: StreamrClient
    let cassandraClient: Client
    let deleteExpiredCmd: DeleteExpiredCmd

    beforeEach(async () => {
        cassandraClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace
        })
        const mockUser = new Wallet(await fetchPrivateKeyWithGas())
        client = createClient(mockUser.privateKey, { orderMessages: false })
        deleteExpiredCmd = new DeleteExpiredCmd({
            streamrBaseUrl: `http://${STREAMR_DOCKER_DEV_HOST}`,
            cassandraUsername: '',
            cassandraPassword: '',
            cassandraHosts: [STREAMR_DOCKER_DEV_HOST],
            cassandraDatacenter: 'datacenter1',
            cassandraKeyspace: 'streamr_dev_v2',
            dryRun: false
        })
    })

    afterEach(async () => {
        await cassandraClient.shutdown()
    })

    const daysArray = [0, 1, 2, 3]
    daysArray.map(async (days) => {
        test(
            `keep in database ${days} days of data`,
            async () => {
                const stream = await createTestStream(client, module, {
                    storageDays: days
                })
                const streamId = stream.id

                const now = Date.now()

                const bucketId1 = await insertBucket(cassandraClient, streamId, now - 0 * DAY_IN_MS)
                const bucketId2 = await insertBucket(cassandraClient, streamId, now - 1 * DAY_IN_MS)
                const bucketId3 = await insertBucket(cassandraClient, streamId, now - 2 * DAY_IN_MS)
                const bucketId4 = await insertBucket(cassandraClient, streamId, now - 3 * DAY_IN_MS)

                await insertData(cassandraClient, streamId, bucketId1, now - 0 * DAY_IN_MS)
                await insertData(cassandraClient, streamId, bucketId2, now - 1 * DAY_IN_MS)
                await insertData(cassandraClient, streamId, bucketId3, now - 2 * DAY_IN_MS)
                await insertData(cassandraClient, streamId, bucketId4, now - 3 * DAY_IN_MS)

                await deleteExpiredCmd.run(client)
                const counts = await checkDBCount(cassandraClient, streamId)
                expect(counts).toEqual({
                    bucketCount: days,
                    messageCount: days
                })
            },
            10 * 1000
        )
    })

    test('max message timestamp of bucket is taken into consideration', async () => {
        const stream = await createTestStream(client, module, {
            storageDays: 10
        })
        const streamId = stream.id
        const now = Date.now()

        const bucketId = await insertBucket(cassandraClient, streamId, now - 30 * DAY_IN_MS)
        await insertData(cassandraClient, streamId, bucketId, now - 30 * DAY_IN_MS)
        await insertData(cassandraClient, streamId, bucketId, now - 15 * DAY_IN_MS)
        // prevents bucket from being deleted
        await insertData(cassandraClient, streamId, bucketId, now - 3 * DAY_IN_MS)

        await deleteExpiredCmd.run(client)
        const counts = await checkDBCount(cassandraClient, streamId)
        expect(counts).toEqual({
            bucketCount: 1,
            messageCount: 3
        })
    })
})
