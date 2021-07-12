// import WebSocket from 'ws'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any

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

        const webSocketClient = new w3cwebsocket(
            serverWsEndpoint.getUrl() + '/ws',
            undefined,
            undefined,
            { 'streamr-peer-id': 'peerId' },
        )
        webSocketClient.onopen = () => {
            webSocketClient.close()
        }
        webSocketClient.onerror = (error) => { throw error }
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })

    test('receives encrypted connections', async () => {
        if (typeof _streamr_electron_test !== 'undefined') {
            return
        }
        const httpsServer = await startHttpServer(
            '127.0.0.1',
            wssPort2,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        serverWsEndpoint = new ServerWsEndpoint('127.0.0.1', wssPort2, true, httpsServer, PeerInfo.newTracker('tracker'))
        const webSocketClient = new w3cwebsocket(
            serverWsEndpoint.getUrl() + '/ws',
            undefined,
            undefined,
            { 'streamr-peer-id': 'peerId' },
            { rejectUnauthorized: false }
        )
        webSocketClient.onopen = () => {
            webSocketClient.close()
        }
        webSocketClient.onerror = (error) => { throw error }
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })
})
