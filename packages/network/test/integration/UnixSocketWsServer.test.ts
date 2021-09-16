import { ServerWsEndpoint, startHttpServer } from "../../src/connection/ws/ServerWsEndpoint"
import { PeerInfo } from "../../src/connection/PeerInfo"
import WebSocket from "ws"
import { waitForCondition } from "streamr-test-utils"

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined

    afterEach(async () => {
        try {
            await serverWsEndpoint?.stop()
        } catch (err) {
        }
    })

    test('works with unix sockets', async () => {
        if (typeof _streamr_electron_test !== 'undefined') {
            return
        }
        const listenConfig = "/tmp/server1.sock"
        const httpsServer = await startHttpServer(
            listenConfig,
        )
        serverWsEndpoint = new ServerWsEndpoint(listenConfig, false, httpsServer, PeerInfo.newTracker('tracker'))
        console.log(serverWsEndpoint.getUrl())
        const webSocketClient = new WebSocket(
            serverWsEndpoint.getUrl(),
            {rejectUnauthorized: false}
        )
        webSocketClient.on('message', async (message: string) => {
            const {uuid, peerId} = JSON.parse(message)
            if (uuid && peerId) {
                webSocketClient.send(JSON.stringify({uuid, peerId: 'peerId'}))
                await waitForCondition(() => webSocketClient.readyState === webSocketClient.OPEN)
                webSocketClient.close()
            }
        })
        webSocketClient.onerror = (error) => {
            throw error
        }
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })
})