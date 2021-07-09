// import WebSocket from 'ws'
import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startWebSocketServer } from '../../src/connection/ws/ServerWsEndpoint'
import {waitForCondition, waitForEvent} from 'streamr-test-utils'
import {describeRepeats} from "../../../client/test/utils";

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
        const [wss, listenSocket] = await startWebSocketServer(
            '127.0.0.1',
            wssPort1,
            undefined,
            undefined
        )
        serverWsEndpoint = new ServerWsEndpoint('127.0.0.1', wssPort1, false, wss, listenSocket, PeerInfo.newTracker('tracker'))
        console.log("unencrypted", serverWsEndpoint.getUrl())

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
        // UwebSockets does not support ssl on Electron
        if (typeof _streamr_electron_test !== 'undefined') {
            return
        }

        const [wss, listenSocket] = await startWebSocketServer(
            '127.0.0.1',
            wssPort2,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        serverWsEndpoint = new ServerWsEndpoint('127.0.0.1', wssPort2, true, wss, listenSocket, PeerInfo.newTracker('tracker'))
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
