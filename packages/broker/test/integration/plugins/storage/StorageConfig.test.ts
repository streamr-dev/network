import { Client } from 'cassandra-driver'
import StreamrClient, { Stream } from 'streamr-client'
import { Protocol, startTracker } from 'streamr-network'
import cassandra from 'cassandra-driver'
import { Wallet } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'
import { Todo } from '../../../../src/types'
import {
    startBroker,
    createClient,
    StorageAssignmentEventManager,
    waitForStreamPersistedInStorageNode,
    STREAMR_DOCKER_DEV_HOST,
    createTestStream
} from '../../../utils'
import { Broker } from '../../../broker'

jest.setTimeout(30000)

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const NODE_HOST = '127.0.0.1'
const STREAMR_URL = `http://${STREAMR_DOCKER_DEV_HOST}`
const HTTP_PORT = 17770
const WS_PORT = 17771
const TRACKER_PORT = 17772

describe('StorageConfig', () => {
    let cassandraClient: Client
    let tracker: Todo
    let storageNode: Broker
    let broker: Broker
    let client: StreamrClient
    let stream: Stream
    let assignmentEventManager: StorageAssignmentEventManager
    const publisherAccount = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0')
    const storageNodeAccount = new Wallet('0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285')
    const brokerAccount = new Wallet('0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae')

    beforeAll(async () => {
        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace,
        })
    })

    afterAll(() => {
        cassandraClient.shutdown()
    })

    beforeEach(async () => {
        const engineAndEditorAccount = new Wallet('0x633a182fb8975f22aaad41e9008cb49a432e9fdfef37f151e9e7c54e96258ef9')
        tracker = await startTracker({
            host: NODE_HOST,
            port: TRACKER_PORT,
            id: 'tracker-1'
        })
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort: TRACKER_PORT,
            httpPort: HTTP_PORT,
            streamrUrl: STREAMR_URL,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: true
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: brokerAccount.privateKey,
            trackerPort: TRACKER_PORT,
            wsPort: WS_PORT,
            streamrUrl: STREAMR_URL,
            enableCassandra: false
        })
        client = createClient(tracker, publisherAccount.privateKey)
        assignmentEventManager = new StorageAssignmentEventManager(tracker, engineAndEditorAccount)
        await assignmentEventManager.createStream()
    })

    afterEach(async () => {
        await client.destroy()
        await Promise.allSettled([storageNode.stop(), broker.stop(), tracker.stop(), assignmentEventManager.close()])
    })

    it('when client publishes a message, it is written to the store', async () => {
        stream = await createTestStream(client, module)
        await assignmentEventManager.addStreamToStorageNode(stream.id, storageNodeAccount.address, client)
        await waitForStreamPersistedInStorageNode(stream.id, 0, NODE_HOST, HTTP_PORT)
        const publishMessage = await client.publish(stream.id, {
            foo: 'bar'
        })
        await waitForCondition(async () => {
            const result = await cassandraClient.execute('SELECT COUNT(*) FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [stream.id])
            return (result.first().count > 0)
        })
        const result = await cassandraClient.execute('SELECT * FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [stream.id])
        const storeMessage = Protocol.StreamMessage.deserialize(JSON.parse(result.first().payload.toString()))
        expect(storeMessage.messageId).toEqual(publishMessage.messageId)
    })
})
