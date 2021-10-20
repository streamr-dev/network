/*
import http from 'http'
import { startTracker, Tracker, Protocol } from 'streamr-network'
import { Wallet } from 'ethers'
import StreamrClient, { Stream } from 'streamr-client'
import { wait, waitForEvent } from 'streamr-test-utils'

import { startBroker, createClient, StorageAssignmentEventManager, createTestStream } from '../../../utils'
import { PassThrough } from 'stream'
import { Broker } from "../../../../src/broker"
import {StoragePlugin} from '../../../plugins/storage/StoragePlugin'

const { StreamMessage, MessageID } = Protocol.MessageLayer

const httpPort1 = 12371
const wsPort1 = 12372
const trackerPort = 12375
const MOCK_DATA_MESSAGE_COUNT = 100

class MockStorageData extends PassThrough {
    constructor(opts: any) {
        super({
            objectMode: true,
            ...opts
        })
        this.startProducer()
    }

    async startProducer() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const i of Array(MOCK_DATA_MESSAGE_COUNT)) {
            await wait(200)
            this.write(new StreamMessage({
                messageId: new MessageID('streamId', 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                content: {},
            }))
        }
        this.end()
    }
}
*/
it.skip('resend cancellation', () => {
    /*
    let tracker: Tracker
    let storageNode: Broker
    let client: StreamrClient
    const storageNodeAccount = Wallet.createRandom()
    let mockStorageData: MockStorageData
    let assignmentEventManager: StorageAssignmentEventManager

    beforeAll(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker-DataMetadataEndpoints'
        })
        client = createClient(tracker)
    })

    beforeAll(async () => {
        const engineAndEditorAccount = Wallet.createRandom()
        const trackerInfo = tracker.getConfigRecord()

        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            trackerId: trackerInfo.id,
            httpPort: httpPort1,
            wsPort: wsPort1,
            enableCassandra: true,
            streamrAddress: engineAndEditorAccount.address,
            trackers: [trackerInfo]
        })

        mockStorageData = new MockStorageData({})
        const storagePlugin: StoragePlugin = storageNode.plugins.find((p) => p.name === 'storage')
        //@ts-expect-error .cassandra is private
        storagePlugin.cassandra.requestLast = mockStorageData
        assignmentEventManager = new StorageAssignmentEventManager(tracker, engineAndEditorAccount, storageNodeAccount)
        await assignmentEventManager.createStream()
    }, 10 * 1000)

    afterEach(async () => {
        await destroy()
        await networkNode.stop()
        await websocketServer.close()
        await tracker.stop()
    })

    beforeAll(async () => {
        mockDataQueryServer = await createMockDataServer()
    })

    afterAll(async () => {
        mockDataQueryServer.close()
        await once(mockDataQueryServer, 'close')
    })

    async function setUpStream(): Promise<Stream> {
        const freshStream = await createTestStream(client, module)
        await freshStream.addToStorageNode(storageNodeAccount.address)
        return freshStream
    }

    it('on client destroy: associated resend is cancelled', async () => {
        const freshStream = await setUpStream()
        await client.getSessionToken()
        // eslint-disable-next-line require-atomic-updates
        client.options.restUrl = `http://127.0.0.1:${httpPort1}`,
        await client.resend({
            stream: freshStream.id,
            resend: {
                last: 1000
            }
        })
        const p = waitForEvent(mockStorageData, 'close', 2000)
        await client.destroy()
        await p
        expect(mockStorageData.destroyed).toBe(true)
    })
    */
})
