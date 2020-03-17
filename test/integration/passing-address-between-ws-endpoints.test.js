const { waitForEvent } = require('streamr-test-utils')

const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { events } = require('../../src/connection/WsEndpoint')
const { LOCALHOST } = require('../util')
const { PeerInfo } = require('../../src/connection/PeerInfo')

describe('passing address between WsEndpoints', () => {
    let wsEndpoint1
    let wsEndpoint2

    beforeEach(async () => {
        wsEndpoint1 = await startEndpoint(LOCALHOST, 31960, PeerInfo.newNode('wsEndpoint1'), null)
    })

    afterEach(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    it('bound address is passed to other WsEndpoint if advertisedWsUrl not set', async () => {
        wsEndpoint2 = await startEndpoint(LOCALHOST, 31961, PeerInfo.newNode('wsEndpoint2'), null)
        wsEndpoint2.connect(`ws://${LOCALHOST}:31960`)
        await waitForEvent(wsEndpoint1, events.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual(`ws://${LOCALHOST}:31961`)
    })

    it('advertised address is passed to other WsEndpoint if advertisedWsUrl set', async () => {
        const advertisedWsUrl = 'ws://advertised-ws-url:666'
        wsEndpoint2 = await startEndpoint(LOCALHOST, 31961, PeerInfo.newNode('wsEndpoint2'), advertisedWsUrl)
        wsEndpoint2.connect(`ws://${LOCALHOST}:31960`)
        await waitForEvent(wsEndpoint1, events.PEER_CONNECTED)
        const address = wsEndpoint1.resolveAddress('wsEndpoint2')
        expect(address).toEqual('ws://advertised-ws-url:666')
    })
})
