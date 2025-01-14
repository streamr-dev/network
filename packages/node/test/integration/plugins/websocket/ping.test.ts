import { Queue } from '@streamr/test-utils'
import { wait, waitForEvent } from '@streamr/utils'
import { StreamrClient } from '@streamr/sdk'
import WebSocket from 'ws'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
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
            server = new WebsocketServer(streamrClient, 0, 0)
            await server.start(WEBSOCKET_PORT, undefined as any)
        })

        afterAll(async () => {
            await server.stop()
        })

        beforeEach(async () => {
            client = new WebSocket(`ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`)
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
            expect(streamrClient.publish).not.toHaveBeenCalled()
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
            expect(streamrClient.publish).not.toHaveBeenCalled()
        })
    })

    describe('server sends protocol pings', () => {
        let server: WebsocketServer

        const startServer = async (sendInterval: number, disconnectTimeout: number) => {
            const streamrClient = {
                publish: () => Promise.resolve()
            }
            server = new WebsocketServer(streamrClient as any, sendInterval, disconnectTimeout)
            await server.start(WEBSOCKET_PORT, new PlainPayloadFormat())
        }

        afterEach(async () => {
            await server.stop()
        })

        it('happy path', async () => {
            const PING_SEND_INTERVAL = 200
            const DISCONNECT_TIMEOUT = 400
            await startServer(PING_SEND_INTERVAL, DISCONNECT_TIMEOUT)
            const client = new WebSocket(
                `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
            )
            await waitForEvent(client, 'open')
            let receivedCount = 0
            let disconnected = false
            client.on('ping', () => {
                receivedCount++
            })
            client.on('close', () => {
                disconnected = true
            })

            // active
            client.send(JSON.stringify({ msg: 1 }))
            await wait(PING_SEND_INTERVAL * 0.9)
            client.send(JSON.stringify({ msg: 2 }))
            await wait(PING_SEND_INTERVAL * 0.9)
            expect(receivedCount).toBe(0)

            // idle, receives ping, and client sends pong automatically
            await wait(PING_SEND_INTERVAL * 0.2)
            expect(receivedCount).toBe(1)

            // back to active
            client.send(JSON.stringify({ msg: 2 }))
            expect(receivedCount).toBe(1)

            // idle, receives ping again, and client sends pong automatically
            await wait(PING_SEND_INTERVAL * 1.1)
            expect(receivedCount).toBe(2)

            // client paused, and therefore doens't send pong
            client.pause()
            await wait(PING_SEND_INTERVAL * 1.1)
            expect(receivedCount).toBe(2)
            expect(disconnected).toBe(false)
            await wait(DISCONNECT_TIMEOUT * 1.1)
            client.resume()
            // wait some time so that buffered events (e.g. 'close' are processed)
            await wait(10)
            expect(disconnected).toBe(true)
        })

        it('no messages', async () => {
            await startServer(50, 100)
            const client = new WebSocket(
                `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
            )
            await waitForEvent(client, 'open')
            client.pause()
            const onClose = jest.fn()
            client.on('close', onClose)
            await wait(200)
            client.resume()
            // wait some time so that buffered events (e.g. 'close' are processed)
            await wait(10)
            expect(onClose).toHaveBeenCalled()
        })

        it('disable ping', async () => {
            await startServer(0, 0)
            const client = new WebSocket(
                `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
            )
            await waitForEvent(client, 'open')
            const onPing = jest.fn()
            client.on('ping', onPing)
            await wait(100)
            expect(onPing).not.toHaveBeenCalled()
        })

        it('disable disconnect', async () => {
            await startServer(20, 0)
            const client = new WebSocket(
                `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(STREAM_ID)}/publish`
            )
            await waitForEvent(client, 'open')
            const onClose = jest.fn()
            client.on('close', onClose)
            client.pause()
            await wait(100)
            expect(onClose).not.toHaveBeenCalled()
        })
    })
})
