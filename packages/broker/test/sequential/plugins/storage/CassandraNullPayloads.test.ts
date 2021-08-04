import { Client, types as cassandraTypes } from 'cassandra-driver'
import { BucketId } from '../../../../src/plugins/storage/Bucket'
import { createClient, STREAMR_DOCKER_DEV_HOST, createTestStream } from "../../../utils"

import { startCassandraStorage, Storage } from '../../../../src/plugins/storage/Storage'

const { TimeUuid } = cassandraTypes

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const DUMMY_WS_PORT = 9999

const insertBucket = async (cassandraClient: Client, streamId: string) => {
    const dateCreate = Date.now()
    const bucketId = TimeUuid.fromDate(new Date(dateCreate)).toString()
    const query = 'INSERT INTO bucket (stream_id, partition, date_create, id, records, size)'
        + 'VALUES (?, 0, ?, ?, 1, 1)'
    await cassandraClient.execute(query, [streamId, dateCreate, bucketId], {
        prepare: true
    })
    return bucketId
}

const insertNullData = async (
    cassandraClient: Client,
    streamId: string,
    bucketId: BucketId
) => {
    const insert = 'INSERT INTO stream_data '
        + '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) '
        + 'VALUES (?, 0, ?, ?, 0, ?, ?, ?)'
    await cassandraClient.execute(insert, [
        streamId, bucketId, new Date(), 'publisherId', 'msgChainId', null
    ], {
        prepare: true
    })
}

describe('CassandraNullPayloads', () => {  
    let cassandraClient: Client
    let storage: Storage

    beforeAll(() => {
        cassandraClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
    })

    afterAll(() => {
        cassandraClient.shutdown()
    })

    beforeEach(async () => {
        storage = await startCassandraStorage({
            contactPoints,
            localDataCenter,
            keyspace,
            opts: {
                checkFullBucketsTimeout: 100,
                storeBucketsTimeout: 100,
                bucketKeepAliveSeconds: 1
            }
        })
    })

    afterEach(async () => {
        await storage.close()
    })

    test('insert a null payload and retreve', async () => {
        const streamrClient = createClient(DUMMY_WS_PORT)
        const stream = await createTestStream(streamrClient, module)
        const streamId = stream.id
        const bucketId = await insertBucket(cassandraClient, streamId)
        await insertNullData(cassandraClient, streamId, bucketId)

        await storage.requestLast(streamId, 0, 1)
        await streamrClient.stop()
    })
})