// import WebSocket from 'ws'

import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import { waitForCondition } from 'streamr-test-utils'
import NodeClientWsEndpoint from "../../src/connection/ws/NodeClientWsEndpoint"

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any
// eslint-disable-next-line no-underscore-dangle
declare let _streamr_simulator_test: any

const wssPort1 = 7777
const wssPort2 = 7778

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined
    let clientWsEndpoint: NodeClientWsEndpoint | undefined = undefined

    afterEach(async () => {
        try {
            await serverWsEndpoint?.stop()
            await clientWsEndpoint?.stop()
        } catch (err) {
        }
    })

    test('receives unencrypted connections', async () => {
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort1
        }
        const httpServer = await startHttpServer(
            listen,
            undefined,
            undefined
        )

        const trackerPeerInfo = PeerInfo.newTracker('tracker')

        serverWsEndpoint = new ServerWsEndpoint(listen, false, httpServer, trackerPeerInfo)
        clientWsEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('node1'))
        
        const result = await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        
        expect(result).toEqual('tracker')
    })

    test('receives encrypted connections', async () => {
        if (typeof _streamr_electron_test !== 'undefined' ||
            typeof _streamr_simulator_test !== 'undefined') {
            return
        }
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort2
        }
        const httpsServer = await startHttpServer(
            listen,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        serverWsEndpoint = new ServerWsEndpoint(listen, true, httpsServer, PeerInfo.newTracker('tracker'))
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
