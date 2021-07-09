import WebSocket from 'ws'
import { waitForEvent } from 'streamr-test-utils'
import { startBroker } from '../../../utils'
import { Broker } from '../../../../src/broker'

function getWsUrlWithControlAndMessageLayerVersions(
    port: number,
    ssl = false,
    controlLayerVersion = 2,
    messageLayerVersion = 32
) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws?controlLayerVersion=${controlLayerVersion}&messageLayerVersion=${messageLayerVersion}`
}

describe('websocket server', () => {
    let ws: WebSocket
    let brokerWithoutSSL: Broker
    let brokerWithSSL: Broker

    beforeAll(async () => {
        brokerWithoutSSL = await startBroker({
            name: 'broker',
            privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
            trackerPort: 666,
            wsPort: 12346
        })
        brokerWithSSL = await startBroker({
            name: 'broker',
            privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
            networkPort: 12347,
            trackerPort: 666,
            wsPort: 12348,
            privateKeyFileName: 'test/fixtures/key.pem',
            certFileName: 'test/fixtures/cert.pem'
        })
    })

    afterEach(() => {
        ws?.terminate()
    })

    afterAll(async () => {
        await Promise.allSettled([
            brokerWithoutSSL?.close(),
            brokerWithSSL?.close()
        ])
    })

    it('receives unencrypted connections', (done) => {
        ws = new WebSocket(getWsUrlWithControlAndMessageLayerVersions(12346, false, 2, 31))
        ws.on('open', () => {
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
    })

    it('receives encrypted connections', (done) => {
        ws = new WebSocket(getWsUrlWithControlAndMessageLayerVersions(12348, true, 2, 31), {
            rejectUnauthorized: false // needed to accept self-signed certificate
        })
        ws.on('open', () => {
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
    })

    describe('rejections', () => {
        const testRejection = async (connectionUrl: string): Promise<[number, string]> => {
            ws = new WebSocket(connectionUrl)
            return await waitForEvent(ws, 'close') as [number, string]
        }

        it('rejects connection with no url parameters', async () => {
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws')
            expect(code).toEqual(1000)
            expect(reason).toEqual('url params missing')
        })

        it('rejects connection with no ControlLayer version', async () => {
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws?messageLayerVersion=32')
            expect(code).toEqual(1000)
            expect(reason).toEqual('controlLayerVersion missing')
        })

        it('rejects connection with no MessageLayer version', async () => {
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws?controlLayerVersion=2')
            expect(code).toEqual(1000)
            expect(reason).toEqual('messageLayerVersion missing')
        })

        it('rejects connection with ControlLayer version set multiple times', async () => {
            // eslint-disable-next-line max-len
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws?controlLayerVersion=2&controlLayerVersion=1&messageLayerVersion=31')
            expect(code).toEqual(1000)
            expect(reason).toEqual('multiple controlLayerVersion given')
        })

        it('rejects connection with MessageLayer version set multiple times', async () => {
            // eslint-disable-next-line max-len
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws?controlLayerVersion=2&messageLayerVersion=31&messageLayerVersion=32')
            expect(code).toEqual(1000)
            expect(reason).toEqual('multiple messageLayerVersion given')
        })

        it('rejects connections with unsupported ControlLayer version', async () => {
            const [code, reason] = await testRejection(getWsUrlWithControlAndMessageLayerVersions(12346, false, 666, 31))
            expect(code).toEqual(1000)
            expect(reason).toEqual('protocol version(s) not supported')
        })

        it('rejects connections with unsupported MessageLayer version', async () => {
            const [code, reason] = await testRejection(getWsUrlWithControlAndMessageLayerVersions(12346, false, 1, 666))
            expect(code).toEqual(1000)
            expect(reason).toEqual('protocol version(s) not supported')
        })
    })
})
