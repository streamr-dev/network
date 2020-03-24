const uWS = require('uWebSockets.js')

const { startWebSocketServer } = require('../../src/connection/WsEndpoint')

describe('test starting startWebSocketServer', () => {
    test('wss using only port', async (done) => {
        await startWebSocketServer(null, 7777).then(async ([wss, listenSocket]) => {
            expect(wss.constructor.name).toBe('uWS.App')
            expect(typeof listenSocket).toBe('object')

            uWS.us_listen_socket_close(listenSocket)
            // eslint-disable-next-line no-param-reassign
            listenSocket = null
            done()
        })
    })

    test('wss using host and port', async (done) => {
        await startWebSocketServer('localhost', 7777).then(async ([wss, listenSocket]) => {
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
})
