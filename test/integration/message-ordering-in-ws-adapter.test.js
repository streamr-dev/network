const { startTracker, startNetworkNode } = require('streamr-network')
const intoStream = require('into-stream')
const StreamrClient = require('streamr-client')
const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { wait, waitForCondition } = require('streamr-test-utils')

const createBroker = require('../../src/broker')

const trackerPort = 11400
const networkPort1 = 11402
const networkPort2 = 11403
const networkPort3 = 11404
const wsPort = 11401

function createStreamMessage(streamId, idx, prevIdx) {
    return StreamMessage.from({
        streamId,
        streamPartition: 0,
        timestamp: idx,
        sequenceNumber: 0,
        publisherId: 'publisherId',
        msgChainId: 'msgChainId',
        previousTimestamp: prevIdx,
        previousSequenceNumber: prevIdx ? 0 : null,
        contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        content: {
            key: idx
        }
    })
}

function createStorageRow(streamId, idx, prevIdx) {
    return {
        timestamp: idx,
        sequenceNo: 0,
        publisherId: 'publisherId',
        msgChainId: 'msgChainId',
        previousTimestamp: prevIdx,
        previousSequenceNo: prevIdx ? 0 : null,
        data: {
            key: idx
        },
        signature: null,
        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
    }
}

describe('message ordering and gap filling in websocket adapter', () => {
    let tracker
    let publisherNode
    let nodeWithMissingMessages
    let broker
    let subscriber
    let freshStream
    let freshStreamId

    beforeAll(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        publisherNode = await startNetworkNode('127.0.0.1', networkPort1, 'publisherNode')
        publisherNode.addBootstrapTracker(`ws://127.0.0.1:${trackerPort}`)
        broker = await createBroker({
            network: {
                id: 'broker',
                hostname: '127.0.0.1',
                port: networkPort2,
                advertisedWsUrl: null,
                tracker: `ws://127.0.0.1:${trackerPort}`,
                isStorageNode: false
            },
            cassandra: {
                hosts: [
                    'localhost',
                ],
                username: '',
                password: '',
                keyspace: 'streamr_dev',
            },
            sentry: false,
            reporting: false,
            streamrUrl: 'http://localhost:8081/streamr-core',
            adapters: [
                {
                    name: 'ws',
                    port: wsPort,
                },
            ]
        })
    })

    beforeEach(async () => {
        subscriber = new StreamrClient({
            url: `ws://localhost:${wsPort}/api/v1/ws`,
            restUrl: 'http://localhost:8081/streamr-core/api/v1',
            auth: {
                apiKey: 'tester1-api-key'
            },
            orderMessages: false,
        })
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E

        freshStream = await subscriber.createStream({
            name: 'message-ordering-in-ws-adapter.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id
    })

    afterEach(async () => {
        await subscriber.ensureDisconnected()
    })

    afterAll(async () => {
        await Promise.all([
            tracker.stop(),
            publisherNode.stop(),
            broker.close()
        ])

        if (nodeWithMissingMessages) {
            await nodeWithMissingMessages.stop()
        }
    })

    it('messages received out-of-order are ordered by ws adapter', async () => {
        const receivedMessages = []

        subscriber.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            receivedMessages.push(message)
        })

        publisherNode.publish(createStreamMessage(freshStreamId, 100, null))
        publisherNode.publish(createStreamMessage(freshStreamId, 500, 400))
        await wait(250)
        publisherNode.publish(createStreamMessage(freshStreamId, 600, 500))
        publisherNode.publish(createStreamMessage(freshStreamId, 200, 100))
        publisherNode.publish(createStreamMessage(freshStreamId, 300, 200))
        await wait(500)
        publisherNode.publish(createStreamMessage(freshStreamId, 400, 300))

        await waitForCondition(() => receivedMessages.length >= 6)

        expect(receivedMessages).toEqual([
            {
                key: 100
            },
            {
                key: 200
            },
            {
                key: 300
            },
            {
                key: 400
            },
            {
                key: 500
            },
            {
                key: 600
            },
        ])
    })

    it('missing messages are gap filled by ws adapter', async () => {
        // Set up new network node that has missing messages in its storage
        const resendRequests = []
        nodeWithMissingMessages = await startNetworkNode('127.0.0.1', networkPort3, 'missingMessagesNode', [{
            store() {},
            requestRange(...args) {
                resendRequests.push(args)
                return intoStream.object([
                    createStorageRow(freshStreamId, 200, 100),
                    createStorageRow(freshStreamId, 300, 200)
                ])
            }
        }])
        nodeWithMissingMessages.addBootstrapTracker(`ws://127.0.0.1:${trackerPort}`)
        nodeWithMissingMessages.subscribe(freshStreamId, 0)

        const receivedMessages = []
        subscriber.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            receivedMessages.push(message)
        })

        publisherNode.publish(createStreamMessage(freshStreamId, 100, null))
        publisherNode.publish(createStreamMessage(freshStreamId, 500, 400))
        publisherNode.publish(createStreamMessage(freshStreamId, 400, 300))
        publisherNode.publish(createStreamMessage(freshStreamId, 600, 500))

        await waitForCondition(() => receivedMessages.length >= 6, 15 * 1000)

        expect(receivedMessages).toEqual([
            {
                key: 100
            },
            {
                key: 200
            },
            {
                key: 300
            },
            {
                key: 400
            },
            {
                key: 500
            },
            {
                key: 600
            },
        ])
        expect(resendRequests).toEqual([[freshStreamId, 0, 100, 1, 300, 0, 'publisherId', 'msgChainId']])
    }, 20 * 1000)
})
