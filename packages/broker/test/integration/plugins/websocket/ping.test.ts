import { Queue } from '@streamr/test-utils'
import { waitForEvent } from '@streamr/utils'
import StreamrClient from 'streamr-client'
import WebSocket from 'ws'
import { createApiAuthenticator } from '../../../../src/apiAuthenticator'
import { WebsocketServer } from '../../../../src/plugins/websocket/WebsocketServer'

const WEBSOCKET_PORT = 12404
const STREAM_ID = 'stream'

describe('ping', () => {

    describe('when client sends ping, server responds with pong', () => {

        let server: WebsocketServer
        let client: WebSocket
        let streamrClient: StreamrClient
        
        beforeAll(async () => {
            streamrClient = {
                publish: jest.fn()
            } as any
            server = new WebsocketServer(streamrClient)
            await server.start(WEBSOCKET_PORT, undefined as any, createApiAuthenticator({} as any))
        })
    
        afterAll(async () => {
            await server.stop()
        })

        beforeEach(async () => {
            client = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`)
            await waitForEvent(client, 'open')
        })

        afterEach(() => {
            client.close()
        })

        it('protocol layer', async () => {
            const PAYLOAD = 'mock-payload'
            const payloads = new Queue<string>()
            client.on('pong', (payload: Buffer) => {
                payloads.push(payload.toString())
            })
            client.ping(PAYLOAD)
            const pongMessage = await payloads.pop()
            expect(pongMessage).toBe(PAYLOAD)
            expect(streamrClient.publish).not.toBeCalled()
        })

        it('application layer', async () => {
            const messages = new Queue<string>()
            client.on('message', (data: WebSocket.RawData) => {
                const payload = data.toString()
                messages.push(payload)
            })
            client.send('ping')
            const pongMessage = await messages.pop()
            expect(pongMessage).toBe('pong')
            expect(streamrClient.publish).not.toBeCalled()
        })
    })
})
