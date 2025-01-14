import { wait, waitForEvent } from '@streamr/utils'
import WebSocket from 'ws'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
import { WebsocketServer } from '../../../../src/plugins/websocket/WebsocketServer'

const WEBSOCKET_PORT = 12405
const STREAM_ID = 'stream'

describe('close', () => {
    it('connection is closed when server stops', async () => {
        const server = new WebsocketServer(undefined as any, 0, 0)
        await server.start(WEBSOCKET_PORT, new PlainPayloadFormat())
        const client = new WebSocket(
            `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
        )
        await waitForEvent(client, 'open')
        const onClose = jest.fn()
        client.on('close', onClose)
        server.stop()
        await wait(100)
        expect(onClose).toHaveBeenCalled()
    })

    it("paused client doesn't prevent server stop", async () => {
        const server = new WebsocketServer(undefined as any, 0, 0)
        await server.start(WEBSOCKET_PORT, new PlainPayloadFormat())
        const client = new WebSocket(
            `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
        )
        await waitForEvent(client, 'open')
        client.pause()
        await server.stop()
    })
})
