import { Client, types as cassandraTypes } from 'cassandra-driver'
import StreamrClient from 'streamr-client'
import { BucketId } from '../../../../src/plugins/storage/Bucket'
import { createMockUser, createClient, STREAMR_DOCKER_DEV_HOST, createTestStream } from "../../../utils"

import { startCassandraStorage, Storage } from '../../../../src/plugins/storage/Storage'

const { TimeUuid } = cassandraTypes

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const insertBucket = async (cassandraClient: Client, streamId: string, dateCreate: number) => {
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
    bucketId: BucketId, 
    ts: number,
) => {
    const insert = 'INSERT INTO stream_data '
        + '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) '
        + 'VALUES (?, 0, ?, ?, 0, ?, ?, ?)'
    await cassandraClient.execute(insert, [
        streamId, bucketId, new Date(ts), 'publisherId', 'msgChainId', null
    ], {
        prepare: true
    })
}

describe('CassandraNullPayloads', () => {   
    let streamrClient: StreamrClient
    let cassandraClient: Client
    let storage: Storage

    beforeEach(async () => {
        cassandraClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })

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
        
        const mockUser = createMockUser()
        streamrClient = createClient(9999, mockUser.privateKey, {
            orderMessages: false,
        })

    })

    afterEach(async () => {
        await streamrClient.stop()
        await cassandraClient.shutdown()

        // will prematurely kill the process if the connection is not delayed
        setTimeout(async () => {
            await storage.close()
        }, 500)

    })

    test('insert a null payload and retreve', async () => {
        const stream = await createTestStream(streamrClient, module, {
            storageDays: 10
        })
        const streamId = stream.id

        const bucketId = await insertBucket(cassandraClient, streamId, Date.now())
        
        await insertNullData(cassandraClient, streamId, bucketId, Date.now())

        await storage.requestLast(streamId, 0, 1)
        
    })
})
