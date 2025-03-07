import { Stream, StreamrClient, convertBytesToStreamMessage } from '@streamr/sdk'
import { createTestWallet } from '@streamr/test-utils'
import { until } from '@streamr/utils'
import cassandra, { Client } from 'cassandra-driver'
import { Wallet } from 'ethers'
import { Broker } from '../../../../src/broker'
import {
    STREAMR_DOCKER_DEV_HOST,
    createClient,
    createTestStream,
    startStorageNode
} from '../../../utils'

jest.setTimeout(30000)

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const HTTP_PORT = 17770

describe('StorageConfig', () => {
    let cassandraClient: Client
    let storageNode: Broker
    let client: StreamrClient
    let stream: Stream
    let publisherAccount: Wallet
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        publisherAccount = await createTestWallet({ gas: true })
        storageNodeAccount = await createTestWallet({ gas: true })
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
    })

    afterAll(async () => {
        await cassandraClient.shutdown()
    })

    beforeEach(async () => {
        client = createClient(publisherAccount.privateKey)
        stream = await createTestStream(client, module)
        storageNode = await startStorageNode(storageNodeAccount.privateKey, HTTP_PORT)
    })

    afterEach(async () => {
        await client.destroy()
        await Promise.allSettled([
            storageNode.stop(),
        ])
    })

    it('when client publishes a message, it is written to the store', async () => {
        await stream.addToStorageNode(storageNodeAccount.address, { wait: true })
        const publishMessage = await client.publish(stream.id, {
            foo: 'bar'
        })
        await until(async () => {
            const result = await cassandraClient.execute('SELECT COUNT(*) FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [stream.id])
            return (result.first().count > 0)
        })
        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [stream.id])
        const storeMessage = convertBytesToStreamMessage(result.first().payload)
        expect(storeMessage.signature).toEqual(publishMessage.signature)
    })
})
