import { Readable } from 'stream'
import { startTracker, startStorageNode, Protocol, MetricsContext, NetworkNode } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import ws from 'uWebSockets.js'
import { WebsocketServer } from '../../src/websocket/WebsocketServer'
import { createClient, STREAMR_DOCKER_DEV_HOST } from '../utils'
import { StreamFetcher } from '../../src/StreamFetcher'
import { Publisher } from '../../src/Publisher'
import { SubscriptionManager } from '../../src/SubscriptionManager'
import { createMockStorageConfig } from './storage/MockStorageConfig'
import { Todo } from '../types'
import StreamrClient, { Stream } from 'streamr-client'

const { StreamMessage, MessageID } = Protocol.MessageLayer

const trackerPort = 17750
const networkNodePort = 17752
const wsPort = 17753

describe('resend cancellation', () => {
    let tracker: Todo
    let metricsContext: MetricsContext
    let websocketServer: WebsocketServer
    let networkNode: NetworkNode
    let client: StreamrClient
    let freshStream: Stream
    let timeoutCleared = false

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
            storages: [
                // @ts-expect-error
                {
                    requestLast: (streamId, streamPartition, n) => {
                        const stream = new Readable({
                            objectMode: true,
                            read() {}
                        })
                        const timeoutRef = setTimeout(() => {
                            // eslint-disable-next-line no-undef
                            fail('pushed to destroyed stream')
                        }, 2000)
                        stream.on('close', () => {
                            if (stream.destroyed) {
                                clearTimeout(timeoutRef)
                                timeoutCleared = true
                            }
                        })
                        stream.push(
                            new StreamMessage({
                                messageId: new MessageID(streamId, streamPartition, 0, 0, 'publisherId', 'msgChainId'),
                                content: {},
                            })
                        )
                        return stream
                    },
                    store: () => {}
                }
            ],
            // @ts-expect-error
            storageConfig: createMockStorageConfig([{
                id: freshStream.id,
                partition: 0
            }])
        })
        websocketServer = new WebsocketServer(
            ws.App(),
            wsPort,
            networkNode,
            new StreamFetcher(`http://${STREAMR_DOCKER_DEV_HOST}`),
            new Publisher(networkNode, {}, metricsContext),
            metricsContext,
            new SubscriptionManager(networkNode)
        )
    })

    afterEach(async () => {
        await client.ensureDisconnected()
        await networkNode.stop()
        await websocketServer.close()
        await tracker.stop()
    })

    it('on client disconnect: associated resend is cancelled', (done) => {
        client.resend({
            stream: freshStream.id,
            resend: {
                last: 1000
            }
        }, async () => {
            await client.ensureDisconnected()
            await waitForCondition(() => timeoutCleared)
            done()
        })
    })
})
