/* eslint-disable no-underscore-dangle */
const allSettled = require('promise.allsettled')
const { waitForEvent } = require('streamr-test-utils')

const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { PeerInfo } = require('../../src/connection/PeerInfo')
const { events } = require('../../src/connection/WsEndpoint')
const { LOCALHOST } = require('../util')
const { disconnectionReasons, disconnectionCodes } = require('../../src/messages/messageTypes')

describe('check and kill dead connections', () => {
    let node1
    const port1 = 43971

    let node2
    const port2 = 43972

    beforeEach(async () => {
        node1 = await startEndpoint(LOCALHOST, port1, PeerInfo.newNode('node1'), null)
        node2 = await startEndpoint(LOCALHOST, port2, PeerInfo.newNode('node2'), null)

        node1.connect(`ws://${LOCALHOST}:${port2}`)
        await waitForEvent(node1, events.PEER_CONNECTED)
    })

    afterEach(async () => {
        allSettled([
            node1.stop(),
            node2.stop()
        ])
    })

    it('if we find dead connection, we force close it', async () => {
        expect(node1.getPeers().size).toBe(1)

        // get alive connection
        const connection = node1.getPeers().get('ws://127.0.0.1:43972')
        expect(connection.readyState).toEqual(1)

        // break connection, not using mock, because it's a uWS external object
        connection.readyState = 10
        expect(connection.readyState).toEqual(10)

        // check connections
        node1._checkConnections()
        jest.spyOn(node1, '_onClose').mockImplementation(() => {})

        node1._checkConnections()

        expect(node1._onClose).toBeCalledTimes(1)
        expect(node1._onClose).toBeCalledWith('ws://127.0.0.1:43972', {
            peerId: 'node2', peerType: 'node'
        }, disconnectionCodes.DEAD_CONNECTION, disconnectionReasons.DEAD_CONNECTION)

        node1._onClose.mockRestore()

        const [peerInfo] = await waitForEvent(node1, events.PEER_DISCONNECTED)
        expect(peerInfo).toEqual(new PeerInfo('node2', 'node'))
    })
})
