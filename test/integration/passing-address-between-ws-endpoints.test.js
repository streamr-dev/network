const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { events } = require('../../src/connection/WsEndpoint')
const { LOCALHOST, waitForEvent } = require('../util')

describe('passing address between WsEndpoints', () => {
    let wsEndpoint1
    let wsEndpoint2

    beforeEach(async () => {
        wsEndpoint1 = await startEndpoint(LOCALHOST, 31960, {}, null)
    })

    afterEach(async () => {
        await wsEndpoint1.stop()
        await wsEndpoint2.stop()
    })

    it('bound address is passed to other WsEndpoint if advertisedWsUrl not set', async () => {
        wsEndpoint2 = await startEndpoint(LOCALHOST, 31961, {}, null)
        wsEndpoint2.connect(`ws://${LOCALHOST}:31960`)
        const [address] = await waitForEvent(wsEndpoint1, events.PEER_CONNECTED)
        expect(address).toEqual('ws://127.0.0.1:31961')
    })

    it('advertised address is passed to other WsEndpoint if advertisedWsUrl set', async () => {
        wsEndpoint2 = await startEndpoint(LOCALHOST, 31961, {}, 'ws://advertised-ws-url:666')
        wsEndpoint2.connect(`ws://${LOCALHOST}:31960`)
        const [address] = await waitForEvent(wsEndpoint1, events.PEER_CONNECTED)
        expect(address).toEqual('ws://advertised-ws-url:666')
    })
})
