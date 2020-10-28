const WebSocket = require('ws')
const uWS = require('uWebSockets.js')

const { PeerInfo } = require('../../src/connection/PeerInfo')
const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')

const wssPort = 7777

describe('test starting startWebSocketServer', () => {
    test('wss using only port', async () => {
        const [wss, listenSocket] = await startWebSocketServer(null, wssPort)
        expect(wss.constructor.name).toBe('uWS.App')
        expect(typeof listenSocket).toBe('object')
        uWS.us_listen_socket_close(listenSocket)
    })

    test('wss using host and port', async () => {
        const [wss, listenSocket] = await startWebSocketServer('127.0.0.1', wssPort)
        expect(wss.constructor.name).toBe('uWS.App')
        expect(typeof listenSocket).toBe('object')
        uWS.us_listen_socket_close(listenSocket)
    })

    test('wss raises error', () => {
        // host must be 'Text and data can only be passed by String, ArrayBuffer or TypedArray.'
        return expect(startWebSocketServer(null, null))
            .rejects
            .toEqual('Text and data can only be passed by String, ArrayBuffer or TypedArray.')
    })

    test('receives unencrypted connections', async (done) => {
        const [wss, listenSocket] = await startWebSocketServer('127.0.0.1', wssPort)

        const peerInfo = PeerInfo.newTracker('id', 'name')
        const endpoint = new WsEndpoint('127.0.0.1', wssPort, wss, listenSocket, peerInfo, null)
        const ws = new WebSocket(`ws://127.0.0.1:${wssPort}/ws?address=127.0.0.1`,
            undefined, {
                headers: {
                    'streamr-peer-id': 'peerId',
                    'streamr-peer-type': 'node',
                }
            })
        ws.on('open', async () => {
            ws.close()
            await endpoint.stop()
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
    })

    test('receives encrypted connections', async (done) => {
        const [wss, listenSocket] = await startWebSocketServer(
            '127.0.0.1',
            wssPort,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )

        const peerInfo = PeerInfo.newTracker('id', 'name')
        const endpoint = new WsEndpoint('127.0.0.1', wssPort, wss, listenSocket, peerInfo, null, undefined, false)
        const ws = new WebSocket(`wss://127.0.0.1:${wssPort}/ws?address=127.0.0.1`,
            undefined, {
                rejectUnauthorized: false, // needed to accept self-signed certificate
                headers: {
                    'streamr-peer-id': 'peerId',
                    'streamr-peer-type': 'node',
                }
            })
        ws.on('open', async () => {
            ws.close()
            await endpoint.stop()
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
    })

    /**
     * This test replicates weird behaviour I encountered while working on "NET-56: Make production
     * tracker run under SSL". When messages arrive to (pure) ws client from a SSL-enabled uWS server,
     * they arrive as type Buffer and not String... which is different to when SSL is disabled...
     */
    test('messages over encrypted connections arrive as binary', async (done) => {
        const [wss, listenSocket] = await startWebSocketServer(
            '127.0.0.1',
            wssPort,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )

        const peerInfo = PeerInfo.newTracker('serverId', 'name')
        const endpoint = new WsEndpoint('127.0.0.1', wssPort, wss, listenSocket, peerInfo, null, false)
        const ws = new WebSocket(`wss://127.0.0.1:${wssPort}/ws?address=127.0.0.1`,
            undefined, {
                rejectUnauthorized: false, // needed to accept self-signed certificate
                headers: {
                    'streamr-peer-id': 'clientId',
                    'streamr-peer-type': 'node',
                }
            })
        ws.on('message', async (msg) => {
            expect(msg).toBeInstanceOf(Buffer) // Weird...
            expect(msg.toString()).toEqual('Hello, World!')
            ws.close()
            await endpoint.stop()
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
        ws.on('open', () => {
            endpoint.send('clientId', 'Hello, World!')
        })
    })

    /**
     * Related to above test: check that messages indeed arrive as string from non-SSL uWS server.
     */
    test('messages over unencrypted connections arrive as string', async (done) => {
        const [wss, listenSocket] = await startWebSocketServer('127.0.0.1', wssPort)

        const peerInfo = PeerInfo.newTracker('serverId', 'name')
        const endpoint = new WsEndpoint('127.0.0.1', wssPort, wss, listenSocket, peerInfo, null, false)
        const ws = new WebSocket(`ws://127.0.0.1:${wssPort}/ws?address=127.0.0.1`,
            undefined, {
                headers: {
                    'streamr-peer-id': 'clientId',
                    'streamr-peer-type': 'node',
                }
            })
        ws.on('message', async (msg) => {
            expect(typeof msg).toEqual('string')
            expect(msg).toEqual('Hello, World!')
            ws.close()
            await endpoint.stop()
            done()
        })
        ws.on('error', (err) => {
            done(err)
        })
        ws.on('open', () => {
            endpoint.send('clientId', 'Hello, World!')
        })
    })
})
