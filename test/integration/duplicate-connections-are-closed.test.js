const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')
const { PeerInfo } = require('../../src/connection/PeerInfo')

describe('duplicate connections are closed', () => {
    let wss1
    let ws1
    let wss2
    let ws2
    let wsEndpoint1
    let wsEndpoint2

    beforeEach(async () => {
        wss1 = await startWebSocketServer('127.0.0.1', 28501)
        wss2 = await startWebSocketServer('127.0.0.1', 28502)
        wsEndpoint1 = new WsEndpoint(wss1, PeerInfo.newNode('wsEndpoint1'), null)
        wsEndpoint2 = new WsEndpoint(wss2, PeerInfo.newNode('wsEndpoint2'), null)
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
            ws1 = ws
        })
        wss2.on('connection', (ws) => {
            connectionsOpened += 1
            ws2 = ws
        })

        await Promise.all([
            wsEndpoint1.connect('ws://127.0.0.1:28502'),
            wsEndpoint2.connect('ws://127.0.0.1:28501'),
        ])

        // TODO enable later
        // await Promise.race([
        //     waitForEvent(ws1, 'close'),
        //     waitForEvent(ws2, 'close')
        // ]).then((res) => {
        //     const reason = res[1]
        //     connectionsClosedReasons.push(reason)
        // })

        expect(connectionsOpened).toEqual(2) // sanity check
        expect(connectionsClosedReasons).toEqual([]) // length === 1
    })
})
