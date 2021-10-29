import url from 'url'
import WebSocket from 'ws'
import fetch from 'node-fetch'
import { startTracker, Protocol, Tracker } from 'streamr-network'
import { startBroker, createClient, createTestStream, getPrivateKey } from '../utils'
import StreamrClient from 'streamr-client'
import { Broker } from '../broker'
import { Wallet } from '@ethersproject/wallet'

const { ControlLayer } = Protocol
const { StreamMessage, MessageIDStrict } = Protocol.MessageLayer

jest.setTimeout(30000)

const trackerPort = 19429
const httpPort = 19422
const wsPort = 19423
// const mqttPort = 19424

const thresholdForFutureMessageSeconds = 5 * 60

function buildMsg(
    streamId: string,
    streamPartition: number,
    timestamp: number,
    sequenceNumber: number,
    publisherId: string,
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
    let publisherAddress: string

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker'
        })
        const brokerWallet = new Wallet(await getPrivateKey())
        broker = await startBroker({
            name: 'storageNode',
            privateKey: brokerWallet.privateKey,
            trackerPort,
            httpPort,
            wsPort,
            enableCassandra: true
        })
        const publisherWallet = new Wallet(await getPrivateKey())
        publisherAddress = publisherWallet.address
        client = createClient(tracker, publisherWallet.privateKey)
        const freshStream = await createTestStream(client, module)
        await freshStream.setPermissions(await brokerWallet.getAddress(), true, true, true, true, true)
        streamId = freshStream.id
    })

    afterEach(async () => {
        await broker.stop()
        await tracker.stop()
        await client.destroy()
    })

    test('pushing message with too future timestamp to HTTP plugin returns 400 error & does not crash broker', async () => {
        const streamMessage = buildMsg(
            streamId, 10, Date.now() + (thresholdForFutureMessageSeconds + 15) * 1000,
            0, publisherAddress, '1', {}
        )

        const query = {
            timestamp: streamMessage.getTimestamp(),
            address: streamMessage.getPublisherId(),
            msgChainId: streamMessage.messageId.msgChainId,
            signatureType: streamMessage.signatureType,
            signature: streamMessage.signature,
        }

        const streamUrl = url.format({
            protocol: 'http',
            hostname: '127.0.0.1',
            port: httpPort,
            pathname: `/streams/${encodeURIComponent(streamId)}`,
            query
        })

        const settings = {
            method: 'POST',
            body: JSON.stringify(streamMessage),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        }

        return fetch(streamUrl, settings)
            .then((res) => {
                // expect(res.status).toEqual(400)
                return res.json()
            })
            .then((json) => {
                expect(json.error).toContain('future timestamps are not allowed')
            })
    })

    test('pushing message with too future timestamp to Websocket plugin returns error & does not crash broker', (done) => {
        const streamMessage = buildMsg(
            streamId, 10, Date.now() + (thresholdForFutureMessageSeconds + 5) * 1000,
            0, publisherAddress, '1', {}
        )

        const publishRequest = new ControlLayer.PublishRequest({
            streamMessage,
            requestId: '',
            sessionToken: null,
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
