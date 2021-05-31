import { startTracker, startStorageNode, Protocol, MetricsContext, NetworkNode } from 'streamr-network'
import { waitForEvent } from 'streamr-test-utils'
import ws from 'uWebSockets.js'
import StreamrClient, { Stream } from 'streamr-client'
import express from 'express'
import { Server } from 'http'
import { once } from 'events'
import { Wallet } from 'ethers'
import { wait } from 'streamr-test-utils'
import { PassThrough } from 'stream'
import { WebsocketServer } from '../../../../src/plugins/websocket/WebsocketServer'
import { StreamFetcher } from '../../../../src/StreamFetcher'
import { Publisher } from '../../../../src/Publisher'
import { SubscriptionManager } from '../../../../src/SubscriptionManager'
import { Todo } from '../../../../src/types'
import { router as dataQueryEndpoints } from '../../../../src/plugins/storage/DataQueryEndpoints'
import { StorageNodeRegistry } from '../../../../src/StorageNodeRegistry'
import { createClient, StorageAssignmentEventManager, STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { createMockStorageConfig } from './MockStorageConfig'

const { StreamMessage, MessageID } = Protocol.MessageLayer

const trackerPort = 17750
const networkNodePort = 17752
const wsPort = 17753
const mockServerPort = 17754
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

describe('resend cancellation', () => {
    let tracker: Todo
    let metricsContext: MetricsContext
    let websocketServer: WebsocketServer
    let networkNode: NetworkNode
    let client: StreamrClient
    let freshStream: Stream
    let mockDataQueryServer: Server
    const mockStorageData = new MockStorageData({})

    const createMockDataServer = async () => {
        const storage: any = {
            requestLast: () => mockStorageData
        }

        const app = express()
        app.use(dataQueryEndpoints(storage, {
            authenticate: () => Promise.resolve(undefined)
        } as any, new MetricsContext(undefined as any)))
        const server = app.listen(mockServerPort)
        await once(server, 'listening')
        return server
    }

    beforeEach(async () => {
        client = createClient(wsPort)
        freshStream = await client.createStream({
            name: 'resends-cancelled-on-client-disconnect.test.js-' + Date.now()
        })
        metricsContext = new MetricsContext(null as any)
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        networkNode = await startStorageNode({
            host: '127.0.0.1',
            port: networkNodePort,
            id: 'networkNode',
            trackers: [tracker.getAddress()],
            storages: [],
            // @ts-expect-error
            storageConfig: createMockStorageConfig([{
                id: freshStream.id,
                partition: 0
            }])
        })
        const storageNodeAddress = Wallet.createRandom().address
        const storageNodeRegistry = StorageNodeRegistry.createInstance(
            {
                storageNodeRegistry: [{
                    address: storageNodeAddress,
                    url: `http://127.0.0.1:${mockServerPort}`
                }],
                streamrUrl: `http://${STREAMR_DOCKER_DEV_HOST}`
            } as any
        )
        websocketServer = new WebsocketServer(
            ws.App(),
            wsPort,
            networkNode,
            new StreamFetcher(`http://${STREAMR_DOCKER_DEV_HOST}`),
            new Publisher(networkNode, {
                validate: () => {}
            }, metricsContext),
            metricsContext,
            new SubscriptionManager(networkNode),
            storageNodeRegistry!,
            `http://${STREAMR_DOCKER_DEV_HOST}`
        )
        const assignmentEventManager = new StorageAssignmentEventManager(wsPort, Wallet.createRandom())
        await assignmentEventManager.createStream()
        await assignmentEventManager.addStreamToStorageNode(freshStream.id, storageNodeAddress, client)
    })

    afterEach(async () => {
        await client.ensureDisconnected()
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

    it('on client disconnect: associated resend is cancelled', async () => {
        await client.resend({
            stream: freshStream.id,
            resend: {
                last: 1000
            }
        })
        const p = waitForEvent(mockStorageData, 'close', 2000)
        await client.ensureDisconnected()
        await p
        expect(mockStorageData.destroyed).toBe(true)
    })
})