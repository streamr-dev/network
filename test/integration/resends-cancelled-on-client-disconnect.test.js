const { Readable } = require('stream')

const { startTracker, startStorageNode } = require('streamr-network')
const { waitForCondition } = require('streamr-test-utils')
const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const ws = require('uWebSockets.js')

const WebsocketServer = require('../../src/websocket/WebsocketServer')
const { createClient } = require('../utils')
const StreamFetcher = require('../../src/StreamFetcher')
const Publisher = require('../../src/Publisher')
const VolumeLogger = require('../../src/VolumeLogger')
const SubscriptionManager = require('../../src/SubscriptionManager')

const trackerPort = 17750
const networkNodePort = 17752
const wsPort = 17753

describe('resend cancellation', () => {
    let tracker
    let websocketServer
    let networkNode
    let client
    let freshStream
    let timeoutCleared = false

    beforeEach(async () => {
        const volumeLogger = new VolumeLogger(0)
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        networkNode = await startStorageNode('127.0.0.1', networkNodePort, 'networkNode', [
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
                    stream.push(StreamMessage.create([streamId, streamPartition, 0, 0, 'publisherId', 'msgChainId'],
                        null, StreamMessage.CONTENT_TYPES.MESSAGE,
                        StreamMessage.ENCRYPTION_TYPES.NONE, {}, StreamMessage.SIGNATURE_TYPES.NONE, null))
                    return stream
                },
                store: () => {}
            }
        ])
        websocketServer = new WebsocketServer(
            ws.App(),
            wsPort,
            networkNode,
            new StreamFetcher('http://localhost:8081/streamr-core'),
            new Publisher(networkNode, volumeLogger),
            volumeLogger,
            new SubscriptionManager(networkNode)
        )
        client = createClient(wsPort, 'tester1-api-key')
        freshStream = await client.createStream({
            name: 'resends-cancelled-on-client-disconnect.test.js-' + Date.now()
        })
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
