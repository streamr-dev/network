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
    STREAMR_DOCKER_DEV_HOST
} from '../../../utils'

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const NODE_HOST = '127.0.0.1'
const STREAMR_URL = `http://${STREAMR_DOCKER_DEV_HOST}`
const HTTP_PORT = 17770
const WS_PORT = 17771
const TRACKER_PORT = 17772
const STORAGE_NODE_PORT = 17773
const BROKER_PORT = 17774

describe('StorageConfig', () => {
    let cassandraClient: Client
    let tracker: Todo
    let storageNode: Todo
    let broker: Todo
    let client: StreamrClient
    let stream: Stream
    let assignmentEventManager: StorageAssignmentEventManager
    const publisherAccount = Wallet.createRandom()
    const storageNodeAccount = Wallet.createRandom()
    const brokerAccount = Wallet.createRandom()

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
        const engineAndEditorAccount = Wallet.createRandom()
        tracker = await startTracker({
            host: NODE_HOST,
            port: TRACKER_PORT,
            id: 'tracker'
        })
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            networkPort: STORAGE_NODE_PORT,
            trackerPort: TRACKER_PORT,
            httpPort: HTTP_PORT,
            streamrUrl: STREAMR_URL,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: true
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: brokerAccount.privateKey,
            networkPort: BROKER_PORT,
            trackerPort: TRACKER_PORT,
            wsPort: WS_PORT,
            streamrUrl: STREAMR_URL,
            enableCassandra: false
        })
        client = createClient(WS_PORT, publisherAccount.privateKey)
        assignmentEventManager = new StorageAssignmentEventManager(WS_PORT, engineAndEditorAccount)
        await assignmentEventManager.createStream()
    })

    afterEach(async () => {
        await client.ensureDisconnected()
        await Promise.allSettled([storageNode.close(), broker.close(), tracker.stop(), assignmentEventManager.close()])
    })

    it('when client publishes a message, it is written to the store', async () => {
        stream = await client.createStream({
            id: publisherAccount.address + '/StorageConfigTest/' + Date.now()
        })
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
        expect(storeMessage.messageId).toEqual(publishMessage.streamMessage.messageId)
    }, 10000)
})
