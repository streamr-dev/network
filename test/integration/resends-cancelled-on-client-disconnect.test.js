const { Readable } = require('stream')

const { startTracker, startStorageNode, Protocol, MetricsContext } = require('streamr-network')
const { waitForCondition } = require('streamr-test-utils')
const ws = require('uWebSockets.js')

const WebsocketServer = require('../../src/websocket/WebsocketServer')
const { createClient, STREAMR_DOCKER_DEV_HOST } = require('../utils')
const StreamFetcher = require('../../src/StreamFetcher')
const { Publisher } = require('../../src/Publisher')
const { SubscriptionManager } = require('../../src/SubscriptionManager')

const { createMockStorageConfig } = require('./storage/MockStorageConfig')

const { StreamMessage, MessageID } = Protocol.MessageLayer

const trackerPort = 17750
const networkNodePort = 17752
const wsPort = 17753

describe('resend cancellation', () => {
    let tracker
    let metricsContext
    let websocketServer
    let networkNode
    let client
    let freshStream
    let timeoutCleared = false

    beforeEach(async () => {
        client = createClient(wsPort)
        freshStream = await client.createStream({
            name: 'resends-cancelled-on-client-disconnect.test.js-' + Date.now()
        })
        metricsContext = new MetricsContext(null)
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
            storageConfig: createMockStorageConfig([{
                id: freshStream.id,
                partition: 0
            }])
        })
        websocketServer = new WebsocketServer(
            ws.App(),
            wsPort,
            networkNode,
            new StreamFetcher(`http://${STREAMR_DOCKER_DEV_HOST}:8081/streamr-core`),
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
