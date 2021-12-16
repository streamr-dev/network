import { Client } from 'cassandra-driver'
import StreamrClient, { Stream } from 'streamr-client'
import { Protocol, Tracker } from 'streamr-network'
import cassandra from 'cassandra-driver'
import { Wallet } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'
import {
    startBroker,
    createClient,
    StorageAssignmentEventManager,
    waitForStreamPersistedInStorageNode,
    STREAMR_DOCKER_DEV_HOST,
    createTestStream,
    getPrivateKey,
    startTestTracker
} from '../../../utils'
import { Broker } from '../../../../src/broker'

jest.setTimeout(30000)

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const NODE_HOST = '127.0.0.1'
const REST_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`
const HTTP_PORT = 17770
const WS_PORT = 17771
const TRACKER_PORT = 17772

describe('StorageConfig', () => {
    let cassandraClient: Client
    let tracker: Tracker
    let storageNode: Broker
    let broker: Broker
    let client: StreamrClient
    let stream: Stream
    let assignmentEventManager: StorageAssignmentEventManager
    let publisherAccount: Wallet
    let storageNodeAccount: Wallet
    let brokerAccount: Wallet

    beforeAll(async () => {
        publisherAccount = new Wallet(await getPrivateKey())
        storageNodeAccount = new Wallet(await getPrivateKey())
        brokerAccount = new Wallet(await getPrivateKey())
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
        const engineAndEditorAccount = new Wallet(await getPrivateKey())
        tracker = await startTestTracker(TRACKER_PORT)
        const storageNodeClient = await createClient(tracker, storageNodeAccount.privateKey)
        await storageNodeClient.setNode(`{"http": "http://127.0.0.1:${HTTP_PORT}/api/v1"}`)
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort: TRACKER_PORT,
            httpPort: HTTP_PORT,
            restUrl: REST_URL,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: true
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: brokerAccount.privateKey,
            trackerPort: TRACKER_PORT,
            wsPort: WS_PORT,
            restUrl: REST_URL,
            enableCassandra: false
        })
        client = await createClient(tracker, publisherAccount.privateKey)
        assignmentEventManager = new StorageAssignmentEventManager(tracker, engineAndEditorAccount, storageNodeAccount)
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
