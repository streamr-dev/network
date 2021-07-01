import WebSocket from 'ws'
import { Stream, StreamrClient } from 'streamr-client'
import { waitForEvent } from 'streamr-test-utils'
import { startTracker, Tracker } from 'streamr-network'
import { Broker } from '../../../../src/broker'
import { createClient, startBroker, fastPrivateKey, createTestStream, createQueue } from '../../../utils'

const WEBSOCKET_PORT = 12400
const LEGACY_WEBSOCKET_PORT = 12401
const TRACKER_PORT = 12402

const privateKey = fastPrivateKey()

describe('Websocket plugin', () => {

    let stream: Stream
    let streamrClient: StreamrClient
    let wsClient: WebSocket
    let tracker: Tracker
    let broker: Broker

    const createWebsocketClient = async (action: string): Promise<WebSocket> => {
        const client = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}/streams/${encodeURIComponent(stream.id)}/${action}`)
        await waitForEvent(client, 'open')
        return client
    }

    beforeAll(async () => {
        tracker = await startTracker({
            id: 'tracker',
            host: '127.0.0.1',
            port: TRACKER_PORT,
        })
        broker = await startBroker({
            name: 'broker',
            privateKey,
            trackerPort: TRACKER_PORT,
            wsPort: LEGACY_WEBSOCKET_PORT,
            extraPlugins: {
                websocket: {
                    port: WEBSOCKET_PORT,
                    sslCertificate: null
                }
            }
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            broker.close(),
            tracker.stop()
        ])
    })

    beforeEach(async () => {
        streamrClient = createClient(LEGACY_WEBSOCKET_PORT, privateKey, {
            autoDisconnect: false
        })
        stream = await createTestStream(streamrClient, module)
    })

    afterEach(async () => {
        wsClient?.close()
        await streamrClient?.ensureDisconnected()
    })

    test('publish', async () => {
        const MOCK_MESSAGE = { foo: 'from-client' }
        const messageQueue = createQueue()
        streamrClient.subscribe(stream.id, messageQueue.push)
        wsClient = await createWebsocketClient('publish')
        wsClient.send(JSON.stringify(MOCK_MESSAGE))
        expect(await messageQueue.pop()).toEqual(MOCK_MESSAGE)
    })

    test('subscribe', async () => {
        const MOCK_MESSAGE = { foo: 'to-client' }
        const messageQueue = createQueue()
        wsClient = await createWebsocketClient('subscribe')
        wsClient.on('message', messageQueue.push)
        await streamrClient.publish(stream.id, MOCK_MESSAGE)
        expect(await messageQueue.pop()).toEqual(JSON.stringify(MOCK_MESSAGE))
    })
})
