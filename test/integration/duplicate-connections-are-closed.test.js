const { wait } = require('../util')
const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')

describe('duplicate connections are closed', () => {
    let wss1
    let wss2
    let wsEndpoint1
    let wsEndpoint2

    beforeEach(async () => {
        wss1 = await startWebSocketServer('127.0.0.1', 28501, {})
        wss2 = await startWebSocketServer('127.0.0.1', 28502, {})
        wsEndpoint1 = new WsEndpoint(wss1, {})
        wsEndpoint2 = new WsEndpoint(wss2, {})
    })

    afterAll(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    test('if two endpoints open a connection (socket) to each other concurrently, one of them should be closed', async () => {
        let connectionsOpened = 0
        const connectionsClosedReasons = []

        wss1.on('connection', (ws) => {
            connectionsOpened += 1
            ws.on('close', (code, reason) => {
                connectionsClosedReasons.push(reason)
            })
        })
        wss2.on('connection', (ws) => {
            connectionsOpened += 1
            ws.on('close', (code, reason) => {
                connectionsClosedReasons.push(reason)
            })
        })

        await Promise.all([
            wsEndpoint1.connect('ws://127.0.0.1:28502'),
            wsEndpoint2.connect('ws://127.0.0.1:28501'),
        ])
        await wait(500)

        expect(connectionsOpened).toEqual(2) // sanity check
        expect(connectionsClosedReasons).toEqual(['streamr:endpoint:duplicate-connection']) // length === 1
    })
})
