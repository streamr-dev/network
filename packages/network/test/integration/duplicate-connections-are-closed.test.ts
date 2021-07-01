import { runAndRaceEvents, waitForEvent } from 'streamr-test-utils'
import { DisconnectionReason, Event } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WebSocketEndpoint } from '../../src/connection/WebSocketEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('duplicate connections are closed', () => {
    let wsEndpoint1: WebSocketEndpoint
    let wsEndpoint2: WebSocketEndpoint

    beforeEach(async () => {
        wsEndpoint1 = await startEndpoint('127.0.0.1', 28501, PeerInfo.newNode('wsEndpoint1'))
        wsEndpoint2 = await startEndpoint('127.0.0.1', 28502, PeerInfo.newNode('wsEndpoint2'))
    })

    afterAll(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    test('if two endpoints open a connection (socket) to each other concurrently, one of them should be closed', async () => {
        const connectionsClosedReasons: string[] = []

        await runAndRaceEvents([
            () => { wsEndpoint1.connect('ws://127.0.0.1:28502')},
            () => {  wsEndpoint2.connect('ws://127.0.0.1:28501')}], [
                [wsEndpoint1, Event.CLOSED_DUPLICATE_SOCKET_TO_PEER],
                [wsEndpoint2, Event.CLOSED_DUPLICATE_SOCKET_TO_PEER]
            ]).then((res) => {
                const reason: any = res[1]
                connectionsClosedReasons.push(reason)
                return res
            })
        
       
        expect(connectionsClosedReasons).toEqual([DisconnectionReason.DUPLICATE_SOCKET]) // length === 1

        // to be sure that everything wrong happened
        expect(wsEndpoint1.getPeers().size).toEqual(1)
        expect(wsEndpoint2.getPeers().size).toEqual(1)
    })
})
