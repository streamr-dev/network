import { waitForEvent } from 'streamr-test-utils'

import { Event } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('passing address between WsEndpoints', () => {
    let wsEndpoint1: WsEndpoint
    let wsEndpoint2: WsEndpoint

    beforeEach(async () => {
        wsEndpoint1 = await startEndpoint('127.0.0.1', 31960, PeerInfo.newNode('wsEndpoint1'), null)
    })

    afterEach(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    it('bound address is passed to other WsEndpoint if advertisedWsUrl not set', async () => {
        wsEndpoint2 = await startEndpoint('127.0.0.1', 31961, PeerInfo.newNode('wsEndpoint2'), null)
        wsEndpoint2.connect('ws://127.0.0.1:31960')
        await waitForEvent(wsEndpoint1, Event.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual('ws://127.0.0.1:31961')
    })

    it('advertised address is passed to other WsEndpoint if advertisedWsUrl set', async () => {
        const advertisedWsUrl = 'ws://advertised-ws-url:666'
        wsEndpoint2 = await startEndpoint('127.0.0.1', 31961, PeerInfo.newNode('wsEndpoint2'), advertisedWsUrl)
        wsEndpoint2.connect('ws://127.0.0.1:31960')
        await waitForEvent(wsEndpoint1, Event.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual('ws://advertised-ws-url:666')
    })
})
