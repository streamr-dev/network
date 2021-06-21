import { waitForEvent } from 'streamr-test-utils'

import { Event } from '../../src/connection/IWsEndpoint'
import { startServerWsEndpoint, ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { ClientWsEndpoint, startClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'

describe('passing address between WsEndpoints', () => {
    let wsEndpoint1: ServerWsEndpoint
    let wsEndpoint2: ClientWsEndpoint

    beforeEach(async () => {
        wsEndpoint1 = await startServerWsEndpoint('127.0.0.1', 31960, PeerInfo.newNode('wsEndpoint1'), null)
    })

    afterEach(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    it('bound address is passed to other WsEndpoint if advertisedWsUrl not set', async () => {
        wsEndpoint2 = await startClientWsEndpoint(PeerInfo.newNode('wsEndpoint2'), null)
        wsEndpoint2.connect('ws://127.0.0.1:31960')
        await waitForEvent(wsEndpoint1, Event.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual('wsEndpoint2')
    })

    it('advertised address is passed to other WsEndpoint if advertisedWsUrl set', async () => {
        const advertisedWsUrl = 'ws://advertised-ws-url:666'
        wsEndpoint2 = await startClientWsEndpoint(PeerInfo.newNode('wsEndpoint2'), advertisedWsUrl)
        wsEndpoint2.connect('ws://127.0.0.1:31960')
        await waitForEvent(wsEndpoint1, Event.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual('wsEndpoint2')
    })
})
