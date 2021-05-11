import http from 'http'
import { startTracker, startNetworkNode } from 'streamr-network'
import { wait } from 'streamr-test-utils'
import { Wallet } from 'ethers'
import { startBroker, createClient, StorageAssignmentEventManager, waitForStreamPersistedInStorageNode } from '../utils'
import { Todo } from '../types'
import StreamrClient, { Stream } from 'streamr-client'

const httpPort1 = 12371
const wsPort1 = 12372
const networkPort1 = 12373
const networkPort2 = 12374
const trackerPort = 12375

const httpGet = (url: string) => {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.setEncoding('utf8')
            let body = ''
            res.on('data', (chunk) => {
                body += chunk
            })
            res.on('end', () => resolve(body))
        }).on('error', reject)
    })
}

const WAIT_TIME_TO_LAND_IN_STORAGE = 3000

describe('DataMetadataEndpoints', () => {
    let tracker: Todo
    let storageNode: Todo
    let client1: StreamrClient
    let publisherNode: Todo
    let freshStream: Stream
    let freshStreamId: string
    const storageNodeAccount = Wallet.createRandom()
    let assignmentEventManager: StorageAssignmentEventManager

    beforeAll(async () => {
        const engineAndEditorAccount = Wallet.createRandom()
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        publisherNode = await startNetworkNode({
            host: '127.0.0.1',
            port: networkPort1,
            id: 'publisherNode',
            trackers: [tracker.getAddress()]
        })
        publisherNode.start()
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            networkPort: networkPort2,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            enableCassandra: true,
            streamrAddress: engineAndEditorAccount.address,
            trackers: [tracker.getAddress()]
        })
        client1 = createClient(wsPort1)
        assignmentEventManager = new StorageAssignmentEventManager(wsPort1, engineAndEditorAccount)
        await assignmentEventManager.createStream()
    }, 10 * 1000)

    beforeEach(async () => {
        freshStream = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id
        await assignmentEventManager.addStreamToStorageNode(freshStreamId, storageNodeAccount.address, client1)
        await waitForStreamPersistedInStorageNode(freshStreamId, 0, '127.0.0.1', httpPort1)
    })

    afterAll(async () => {
        await tracker.stop()
        await client1.ensureDisconnected()
        await publisherNode.stop()
        await storageNode.close()
        await assignmentEventManager.close()
    })

    it('should fetch empty metadata from Cassandra', async () => {
        const json: any = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/0/metadata/partitions/0`)
        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(0)
        expect(res.totalMessages).toEqual(0)
        expect(res.firstMessage).toEqual(0)
        expect(res.lastMessage).toEqual(0)
    })

    it('Should publish a single message, store it in Cassandra and return according metadata', async () => {
        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(WAIT_TIME_TO_LAND_IN_STORAGE)

        const json: any = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/metadata/partitions/0`)
        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(290)
        expect(res.totalMessages).toEqual(1)
        expect(res.firstMessage).toEqual(res.lastMessage)
    })

    it('Should publish multiple messages, store them in Cassandra and return according metadata', async () => {
        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(WAIT_TIME_TO_LAND_IN_STORAGE)

        const json: any = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/metadata/partitions/0`)
        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(1199)
        expect(res.totalMessages).toEqual(4)
        expect(
            new Date(res.firstMessage).getTime()
        ).toBeLessThan(
            new Date(res.lastMessage).getTime()
        )
    })
})
