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
        const endpoint = new WsEndpoint('127.0.0.1', wssPort, wss, listenSocket, peerInfo, null, false)
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
})
