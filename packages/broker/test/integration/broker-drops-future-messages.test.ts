import url from 'url'
import WebSocket from 'ws'
import fetch from 'node-fetch'
import { startTracker, Protocol } from 'streamr-network'
import { startBroker, createClient, createTestStream } from '../utils'
import StreamrClient from 'streamr-client'
import { Todo } from '../types'

const { ControlLayer } = Protocol
const { StreamMessage, MessageIDStrict } = Protocol.MessageLayer

const trackerPort = 19420
const networkPort = 19421
const httpPort = 19422
const wsPort = 19423
const mqttPort = 19424

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
    let tracker: Todo
    let broker: Todo
    let streamId: string
    let client: StreamrClient
    let token: string

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x0381aa979c2b85ce409f70f6c64c66f70677596c7acad0b58763b0990cd5fbff',
            networkPort,
            trackerPort,
            httpPort,
            wsPort,
            legacyMqttPort: mqttPort
        })

        client = createClient(wsPort)
        const freshStream = await createTestStream(client, module)
        streamId = freshStream.id
        token = await client.session.getSessionToken()
    })

    afterEach(async () => {
        await broker.close()
        await tracker.stop()
        await client.ensureDisconnected()
    })

    test('pushing message with too future timestamp to HTTP plugin returns 400 error & does not crash broker', async () => {
        const streamMessage = buildMsg(
            streamId, 10, Date.now() + (thresholdForFutureMessageSeconds + 5) * 1000,
            0, 'publisher', '1', {}
        )

        const query = {
            ts: streamMessage.getTimestamp(),
            address: streamMessage.getPublisherId(),
            msgChainId: streamMessage.messageId.msgChainId,
            signatureType: streamMessage.signatureType,
            signature: streamMessage.signature,
        }

        const streamUrl = url.format({
            protocol: 'http',
            hostname: '127.0.0.1',
            port: httpPort,
            pathname: `/api/v1/streams/${encodeURIComponent(streamId)}/data`,
            query
        })

        const settings = {
            method: 'POST',
            body: streamMessage.serialize(),
            headers: {
                Authorization: 'Bearer ' + token,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        }

        return fetch(streamUrl, settings)
            .then((res) => {
                expect(res.status).toEqual(400)
                return res.json()
            })
            .then((json) => {
                expect(json.error).toContain('future timestamps are not allowed')
            })
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
