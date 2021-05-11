import { waitForEvent } from 'streamr-test-utils'

import { DisconnectionReason } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('duplicate connections are closed', () => {
    let wsEndpoint1: WsEndpoint
    let wsEndpoint2: WsEndpoint

    beforeEach(async () => {
        wsEndpoint1 = await startEndpoint('127.0.0.1', 28501, PeerInfo.newNode('wsEndpoint1'), null)
        wsEndpoint2 = await startEndpoint('127.0.0.1', 28502, PeerInfo.newNode('wsEndpoint2'), null)
    })

    afterAll(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    test('if two endpoints open a connection (socket) to each other concurrently, one of them should be closed', async () => {
        const connectionsClosedReasons: string[] = []

        await Promise.allSettled([
            wsEndpoint1.connect('ws://127.0.0.1:28502'),
            wsEndpoint2.connect('ws://127.0.0.1:28501')
        ])

        await Promise.race([
            waitForEvent(wsEndpoint1, 'close'),
            waitForEvent(wsEndpoint2, 'close')
        ]).then((res) => {
            const reason: any = res[2]
            connectionsClosedReasons.push(reason)
            return res
        })

        expect(connectionsClosedReasons).toEqual([DisconnectionReason.DUPLICATE_SOCKET]) // length === 1

        // to be sure that everything wrong happened
        expect(wsEndpoint1.getPeers().size).toEqual(1)
        expect(wsEndpoint2.getPeers().size).toEqual(1)
    })
})
