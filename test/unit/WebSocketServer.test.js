const WebSocket = require('ws')
const uWS = require('uWebSockets.js')

const { LOCALHOST } = require('../util')
const { PeerInfo } = require('../../src/connection/PeerInfo')
const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')

const wssPort = 7777

describe('test starting startWebSocketServer', () => {
    test('wss using only port', async (done) => {
        await startWebSocketServer(null, wssPort).then(async ([wss, listenSocket]) => {
            expect(wss.constructor.name).toBe('uWS.App')
            expect(typeof listenSocket).toBe('object')

            uWS.us_listen_socket_close(listenSocket)
            // eslint-disable-next-line no-param-reassign
            listenSocket = null
            done()
        })
    })

    test('wss using host and port', async (done) => {
        await startWebSocketServer(LOCALHOST, wssPort).then(async ([wss, listenSocket]) => {
            expect(wss.constructor.name).toBe('uWS.App')
            expect(typeof listenSocket).toBe('object')

            uWS.us_listen_socket_close(listenSocket)
            // eslint-disable-next-line no-param-reassign
            listenSocket = null
            done()
        })
    })

    test('wss raises error', () => {
        // host must be 'Text and data can only be passed by String, ArrayBuffer or TypedArray.'
        return expect(startWebSocketServer(null, null)).rejects.toEqual('Text and data can only be passed by String, ArrayBuffer or TypedArray.')
    })

    test('receives unencrypted connections', async (done) => {
        const [wss, listenSocket] = await startWebSocketServer(LOCALHOST, wssPort)

        const peerInfo = PeerInfo.newTracker('id', 'name')
        const endpoint = new WsEndpoint(LOCALHOST, wssPort, wss, listenSocket, peerInfo, null)
        const ws = new WebSocket(`ws://${LOCALHOST}:${wssPort}/ws?address=${LOCALHOST}`,
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
        const [wss, listenSocket] = await startWebSocketServer(LOCALHOST, wssPort, 'test/fixtures/key.pem', 'test/fixtures/cert.pem')

        const peerInfo = PeerInfo.newTracker('id', 'name')
        const endpoint = new WsEndpoint(LOCALHOST, wssPort, wss, listenSocket, peerInfo, null, false)
        const ws = new WebSocket(`wss://${LOCALHOST}:${wssPort}/ws?address=${LOCALHOST}`,
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
