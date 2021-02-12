const WebSocket = require('ws')
const { waitForCondition } = require('streamr-test-utils')

const { startBroker, getWsUrlWithControlAndMessageLayerVersions } = require('../utils')

describe('websocket server', () => {
    let ws
    let broker

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
        })
    })

    describe('rejections', () => {
        const testRejection = async (connectionUrl) => {
            broker = await startBroker({
                name: 'broker',
                privateKey: '0xf3b269f5d8066bcf23a384937c0cd693cfbb8ff90a1055d4e47047150f5482c4',
                networkPort: 12345,
                trackerPort: 666,
                wsPort: 12346
            })
            ws = new WebSocket(connectionUrl)
            let gotError = false
            let closed = false
            ws.on('open', () => {
                throw new Error('Websocket should not have opened!')
            })
            ws.on('error', (err) => {
                if (err.message.includes('400')) {
                    gotError = true
                } else {
                    throw new Error(`Got unexpected error message: ${err.message}`)
                }
            })
            ws.on('close', () => {
                closed = true
            })
            await waitForCondition(() => gotError && closed)
        }

        it('rejects connections without preferred versions given as query parameters', async () => {
            await testRejection('ws://127.0.0.1:12346/api/v1/ws')
        })

        it('rejects connections with unsupported ControlLayer version', async () => {
            await testRejection(getWsUrlWithControlAndMessageLayerVersions(12346, false, 666, 31))
        })

        it('rejects connections with unsupported MessageLayer version', async () => {
            await testRejection(getWsUrlWithControlAndMessageLayerVersions(12346, false, 1, 666))
        })
    })
})
