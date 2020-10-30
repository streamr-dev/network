/* eslint-disable no-underscore-dangle */
const { waitForEvent } = require('streamr-test-utils')

const { startEndpoint, disconnectionReasons, disconnectionCodes } = require('../../src/connection/WsEndpoint')
const { PeerInfo } = require('../../src/connection/PeerInfo')
const { events } = require('../../src/connection/WsEndpoint')

describe('check and kill dead connections', () => {
    let node1
    let node2

    const defaultLocation = {
        latitude: null,
        longitude: null,
        country: null,
        city: null
    }
    beforeEach(async () => {
        node1 = await startEndpoint('127.0.0.1', 43971, PeerInfo.newNode('node1'), null)
        node2 = await startEndpoint('127.0.0.1', 43972, PeerInfo.newNode('node2'), null)

        node1.connect('ws://127.0.0.1:43972')
        await waitForEvent(node1, events.PEER_CONNECTED)
    })

    afterEach(async () => {
        Promise.allSettled([
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
        connection.readyState = 0
        expect(connection.readyState).toEqual(0)

        jest.spyOn(node1, '_onClose').mockImplementation(() => {})

        // check connections
        jest.spyOn(connection, 'ping').mockImplementation(() => {
            throw new Error('test error')
        })
        node1._pingConnections()

        expect(node1._onClose).toBeCalledTimes(1)
        expect(node1._onClose).toBeCalledWith('ws://127.0.0.1:43972', {
            peerId: 'node2', peerName: 'node2', peerType: 'node', location: defaultLocation
        }, disconnectionCodes.DEAD_CONNECTION, disconnectionReasons.DEAD_CONNECTION)

        node1._onClose.mockRestore()
        node1._pingConnections()

        const [peerInfo] = await waitForEvent(node1, events.PEER_DISCONNECTED)
        expect(peerInfo).toEqual(new PeerInfo('node2', 'node', 'node2', defaultLocation))
    })
})
