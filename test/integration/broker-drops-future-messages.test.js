const url = require('url')

const WebSocket = require('ws')
const fetch = require('node-fetch')
const { startTracker } = require('streamr-network')
const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { ControlLayer } = require('streamr-client-protocol')

const { startBroker, createClient, createMqttClient } = require('../utils')

const trackerPort = 19420
const networkPort = 19421
const httpPort = 19422
const wsPort = 19423
const mqttPort = 19424

// default thresholdForFutureMessageSeconds is 300 seconds = 5 minutes
const thresholdForFutureMessageSeconds = 5 * 60

describe('broker drops future messages', () => {
    let tracker
    let broker
    let streamId
    let client
    let mqttClient
    let token

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker = await startBroker('broker', networkPort, trackerPort, httpPort, wsPort, mqttPort, false)

        mqttClient = createMqttClient(mqttPort)
        client = createClient(wsPort, 'tester1-api-key')
        const freshStream = await client.createStream({
            name: 'broker-drops-future-messages' + Date.now()
        })
        streamId = freshStream.id
        token = await client.session.getSessionToken()
    })

    afterEach(async () => {
        await broker.close()
        await tracker.stop()

        await client.ensureDisconnected()
        await mqttClient.end(true)
    })

    test('pushing message with too future timestamp to HTTP adapter returns 400 error & does not crash broker', (done) => {
        const streamMessage = StreamMessage.create(
            [streamId, 0, Date.now() + (thresholdForFutureMessageSeconds + 5) * 1000, 0, 'publisherId', '1'],
            null,
            StreamMessage.CONTENT_TYPES.MESSAGE,
            StreamMessage.ENCRYPTION_TYPES.NONE,
            '{}',
            StreamMessage.SIGNATURE_TYPES.NONE,
            null,
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
            pathname: `/api/v1/streams/${streamId}/data`,
            query
        })

        const settings = {
            method: 'POST',
            body: streamMessage.serialize(),
            headers: {
                Authorization: 'token tester1-api-key',
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        }

        fetch(streamUrl, settings)
            .then((res) => {
                expect(res.status).toEqual(400)
                return res.json()
            })
            .then((json) => {
                expect(json.error).toContain('future timestamps are not allowed')
                done()
            })
    })

    test('pushing message with too future timestamp to Websocket adapter returns error & does not crash broker', (done) => {
        const streamMessage = StreamMessage.create(
            [streamId, 0, Date.now() + (thresholdForFutureMessageSeconds + 5) * 1000, 0, 'publisherId', '1'],
            null,
            StreamMessage.CONTENT_TYPES.MESSAGE,
            StreamMessage.ENCRYPTION_TYPES.NONE,
            '{}',
            StreamMessage.SIGNATURE_TYPES.NONE,
            null,
        )
        const publishRequest = ControlLayer.PublishRequest.create(streamMessage, token)

        const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/api/v1/ws?messageLayerVersion=31&controlLayerVersion=0`, {
            rejectUnauthorized: false // needed to accept self-signed certificate
        })

        ws.on('open', () => {
            ws.send(publishRequest.serialize())
        })

        ws.on('message', (msg) => {
            console.log(msg)
            expect(msg).toContain('future timestamps are not allowed')
            ws.close()
            done()
        })

        ws.on('error', (err) => done(err))
    })
})
