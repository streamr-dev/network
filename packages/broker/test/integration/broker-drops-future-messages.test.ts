import WebSocket from 'ws'
import { Protocol, Tracker } from 'streamr-network'
import { startBroker, createClient, createTestStream, startTestTracker } from '../utils'
import StreamrClient from 'streamr-client'
import { Broker } from '../../src/broker'

const { ControlLayer } = Protocol
const { StreamMessage, MessageIDStrict } = Protocol.MessageLayer

const trackerPort = 19420
const httpPort = 19422
const wsPort = 19423

const thresholdForFutureMessageSeconds = 5 * 60

function buildMsg(
    streamId: string,
    streamPartition: number,
    timestamp: number,
    sequenceNumber: number,
    publisherId = 'publisher',
    msgChainId = '1',
    content = {}
) {
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId),
        content: JSON.stringify(content)
    })
}

describe('broker drops future messages', () => {
    let tracker: Tracker
    let broker: Broker
    let streamId: string
    let client: StreamrClient
    let token: string

    beforeEach(async () => {
        tracker = await startTestTracker(trackerPort)
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x0381aa979c2b85ce409f70f6c64c66f70677596c7acad0b58763b0990cd5fbff',
            trackerPort,
            httpPort,
            wsPort
        })

        client = createClient(tracker)
        const freshStream = await createTestStream(client, module)
        streamId = freshStream.id
        token = await client.getSessionToken()
    })

    afterEach(async () => {
        await broker.stop()
        await tracker.stop()
        await client.destroy()
    })

    test('pushing message with too future timestamp to Websocket plugin returns error & does not crash broker', (done) => {
        const streamMessage = buildMsg(
            streamId, 10, Date.now() + (thresholdForFutureMessageSeconds + 5) * 1000,
            0, 'publisher', '1', {}
        )

        const publishRequest = new ControlLayer.PublishRequest({
            streamMessage,
            requestId: '',
            sessionToken: token,
        })

        const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/api/v1/ws?messageLayerVersion=31&controlLayerVersion=2`, {
            rejectUnauthorized: false // needed to accept self-signed certificate
        })

        ws.on('open', () => {
            ws.send(publishRequest.serialize())
        })

        ws.on('message', (msg) => {
            expect(msg).toContain('future timestamps are not allowed')
            ws.close()
            done()
        })

        ws.on('error', (err) => done(err))
    })
})
