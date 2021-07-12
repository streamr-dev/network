import WebSocket from 'ws'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import { waitForEvent } from 'streamr-test-utils'

const wssPort1 = 7777
const wssPort2 = 7778

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined

    afterEach(async () => {
        await serverWsEndpoint?.stop()
    })

    test('receives unencrypted connections', async () => {
        const httpServer = await startHttpServer(
            '127.0.0.1',
            wssPort1,
            undefined,
            undefined
        )
        serverWsEndpoint = new ServerWsEndpoint('127.0.0.1', wssPort1, false, httpServer, PeerInfo.newTracker('tracker'))

        const ws = new WebSocket(serverWsEndpoint.getUrl() + '/ws',
            undefined, {
                headers: {
                    'streamr-peer-id': 'peerId'
                }
            })
        ws.once('error', (err) => {
            throw err
        })
        await waitForEvent(ws, 'open')
        ws.close()
    })

    test('receives encrypted connections', async () => {
        const httpsServer = await startHttpServer(
            '127.0.0.1',
            wssPort2,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        serverWsEndpoint = new ServerWsEndpoint('127.0.0.1', wssPort2, true, httpsServer, PeerInfo.newTracker('tracker'))

        const ws = new WebSocket(serverWsEndpoint.getUrl() + '/ws',
            undefined, {
                rejectUnauthorized: false, // needed to accept self-signed certificate
                headers: {
                    'streamr-peer-id': 'peerId'
                }
            })
        ws.once('error', (err) => {
            throw err
        })
        await waitForEvent(ws, 'open')
        ws.close()
    })
})
