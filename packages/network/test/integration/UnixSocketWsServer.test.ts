import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import WebSocket from 'ws'
import { waitForCondition } from '@streamr/utils'
import { createTestServerWsEndpoint } from '../utils'

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined

    afterEach(async () => {
        try {
            await serverWsEndpoint?.stop()
        } catch (err) {
            // no-op
        }
    })

    test('WS connection can established with unix sockets', async () => {
        const listen = "/tmp/server1.sock"
        const httpsServer = await startHttpServer(
            listen,
        )
        serverWsEndpoint = createTestServerWsEndpoint(listen, false, httpsServer, PeerInfo.newTracker('tracker'))
        const webSocketClient = new WebSocket(
            serverWsEndpoint.getUrl(),
            { rejectUnauthorized: false }
        )
        webSocketClient.on('message', async (message: string) => {
            const { uuid, peerId } = JSON.parse(message)
            if (uuid && peerId) {
                webSocketClient.send(JSON.stringify({ uuid, peerId: 'peerId' }))
                await waitForCondition(() => webSocketClient.readyState === webSocketClient.OPEN)
                webSocketClient.close()
            }
        })
        webSocketClient.on("error", (error) => {
            throw error
        })
        await waitForCondition(() => webSocketClient.readyState === webSocketClient.CLOSED)
    })
})
