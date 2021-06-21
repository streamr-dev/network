import { startClientWsEndpoint, ClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'
import { startServerWsEndpoint, ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'

import { PeerInfo } from '../../src/connection/PeerInfo'

describe('duplicate connections are closed', () => {
    let wsServer1: ServerWsEndpoint

    let wsClient1: ClientWsEndpoint
    let wsClient2: ClientWsEndpoint

    beforeEach(async () => {
        wsServer1 = await startServerWsEndpoint('127.0.0.1', 28501, PeerInfo.newNode('wsServer1'), null)

        wsClient1 = await startClientWsEndpoint(PeerInfo.newNode('wsClient1'), null)
        wsClient2 = await startClientWsEndpoint(PeerInfo.newNode('wsClient2'), null)
    })

    afterAll(async () => {
        await wsServer1.stop()
        await wsClient1.stop()
        await wsClient2.stop()
    })

    test('if two endpoints open a connection (socket) to each other concurrently, one of them should be closed', async () => {
        /* still relevant?
        const connectionsClosedReasons: string[] = []

        await Promise.allSettled([
            wsClient1.connect('ws://127.0.0.1:28501'),
            wsClient2.connect('ws://127.0.0.1:28501')
        ])

        await Promise.race([
            waitForEvent(wsClient1, 'close'),
            waitForEvent(wsClient2, 'close')
        ]).then((res) => {
            const reason: any = res[2]
            connectionsClosedReasons.push(reason)
            return res
        })

        expect(connectionsClosedReasons).toEqual([DisconnectionReason.DUPLICATE_SOCKET]) // length === 1

        // to be sure that everything wrong happened
        expect(wsClient1.getPeers().size).toEqual(1)
        expect(wsClient2.getPeers().size).toEqual(1)
        */
    })
})
