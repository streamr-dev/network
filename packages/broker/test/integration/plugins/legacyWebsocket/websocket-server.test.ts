import WebSocket from 'ws'
import { waitForEvent } from 'streamr-test-utils'
import { Todo } from '../../../../src/types'
import { startBroker, getWsUrlWithControlAndMessageLayerVersions } from '../../../utils'

describe('websocket server', () => {
    let ws: WebSocket
    let broker: Todo

    afterEach(async () => {
        if (ws) {
            ws.terminate()
        }
        await broker.close()
    })

    it('receives unencrypted connections', (done) => {
        startBroker({
            name: 'broker',
            privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
            networkPort: 12345,
            trackerPort: 666,
            wsPort: 12346
        }).then((newBroker) => {
            broker = newBroker
            ws = new WebSocket(getWsUrlWithControlAndMessageLayerVersions(12346, false, 2, 31))
            ws.on('open', () => {
                done()
            })
            ws.on('error', (err) => {
                done(err)
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    it('receives encrypted connections', (done) => {
        startBroker({
            name: 'broker',
            privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
            networkPort: 12345,
            trackerPort: 666,
            wsPort: 12346,
            privateKeyFileName: 'test/fixtures/key.pem',
            certFileName: 'test/fixtures/cert.pem'
        }).then((newBroker) => {
            broker = newBroker
            ws = new WebSocket(getWsUrlWithControlAndMessageLayerVersions(12346, true, 2, 31), {
                rejectUnauthorized: false // needed to accept self-signed certificate
            })
            ws.on('open', () => {
                done()
            })
            ws.on('error', (err) => {
                done(err)
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    describe('rejections', () => {
        const testRejection = async (connectionUrl: string): Promise<[number, string]> => {
            broker = await startBroker({
                name: 'broker',
                privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
                networkPort: 12345,
                trackerPort: 666,
                wsPort: 12346
            })
            ws = new WebSocket(connectionUrl)
            return await waitForEvent(ws, 'close') as [number, string]
        }

        it('rejects connections without preferred versions given as query parameters', async () => {
            const [code, reason] = await testRejection('ws://127.0.0.1:12346/api/v1/ws')
            expect(code).toEqual(1000)
            expect(reason).toEqual('version params missing')
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
