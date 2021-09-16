// import WebSocket from 'ws'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import { waitForCondition } from 'streamr-test-utils'

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any

const wssPort1 = 7777
const wssPort2 = 7778

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined

    afterEach(async () => {
        try {
            await serverWsEndpoint?.stop()
        } catch (err) {
        }
    })

    test('receives unencrypted connections', async () => {
        const listenConfig = {
            hostname: '127.0.0.1',
            port: wssPort1
        }
        const httpServer = await startHttpServer(
            listenConfig,
            undefined,
            undefined
        )
        serverWsEndpoint = new ServerWsEndpoint(listenConfig, false, httpServer, PeerInfo.newTracker('tracker'))

        const webSocketClient = new w3cwebsocket(
            serverWsEndpoint.getUrl() + '/ws'
        )
        webSocketClient.onmessage = (message) => {
            const { uuid, peerId } = JSON.parse(message.data.toString())
            if (uuid && peerId) {
                webSocketClient.send(JSON.stringify({uuid, peerId: 'peerId'}))
                webSocketClient.close()
            }
        }
        webSocketClient.onerror = (error) => { throw error }
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })

    test('receives encrypted connections', async () => {
        if (typeof _streamr_electron_test !== 'undefined') {
            return
        }
        const listenConfig = {
            hostname: '127.0.0.1',
            port: wssPort2
        }
        const httpsServer = await startHttpServer(
            listenConfig,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        serverWsEndpoint = new ServerWsEndpoint(listenConfig, true, httpsServer, PeerInfo.newTracker('tracker'))
        const webSocketClient = new w3cwebsocket(
            serverWsEndpoint.getUrl() + '/ws',
            undefined,
            undefined,
            undefined,
            { rejectUnauthorized: false }
        )
        webSocketClient.onmessage = async (message) => {
            const { uuid, peerId } = JSON.parse(message.data.toString())
            if (uuid && peerId) {
                webSocketClient.send(JSON.stringify({uuid, peerId: 'peerId'}))
                await waitForCondition(() => webSocketClient.readyState === webSocketClient.OPEN)
                webSocketClient.close()
            }
        }
        webSocketClient.onerror = (error) => { throw error }
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })
})
