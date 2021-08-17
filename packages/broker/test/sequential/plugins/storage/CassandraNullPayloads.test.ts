import { Client, types as cassandraTypes } from 'cassandra-driver'
import toArray from 'stream-to-array'
import { BucketId } from '../../../../src/plugins/storage/Bucket'
import { createClient, STREAMR_DOCKER_DEV_HOST, createTestStream } from "../../../utils"
import { startCassandraStorage, Storage } from '../../../../src/plugins/storage/Storage'
import { Protocol } from 'streamr-network'
const { StreamMessage, MessageIDStrict } = Protocol.MessageLayer

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
        streamId, bucketId, new Date(), '', '', null
    ], {
        prepare: true
    })
}

async function storeMockMessages({
    streamId,
    count,
    storage
}: {
    streamId: string
    count: number
    storage: Storage
}) {
    const storePromises = []
    for (let i = 0; i < count; i++) {
        const timestamp = Math.floor((i / (count - 1)) * (1E10))

        const msg = new StreamMessage({
            messageId: new MessageIDStrict(streamId, 0, timestamp, 0, '', ''),
            content: JSON.stringify({})
        })
        storePromises.push(storage.store(msg))
    }
    return Promise.all(storePromises)
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

    test('insert a null payload and retreve n-1 messages (null not included in return set)', async () => {
        const HEALTHY_MESSAGE_COUNT = 9
        const streamrClient = createClient(DUMMY_WS_PORT)
        const stream = await createTestStream(streamrClient, module)
        await streamrClient.disconnect()
        const streamId = stream.id

        const bucketId = await insertBucket(cassandraClient, streamId)

        await insertNullData(cassandraClient, streamId, bucketId)
        await storeMockMessages({ streamId, count: HEALTHY_MESSAGE_COUNT, storage })

        const streamingResults = storage.requestLast(streamId, 0, (HEALTHY_MESSAGE_COUNT + 1))
        const messages = await toArray(streamingResults)
        expect(messages.length).toEqual(HEALTHY_MESSAGE_COUNT)
    })
})