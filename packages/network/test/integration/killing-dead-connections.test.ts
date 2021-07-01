/* eslint-disable no-underscore-dangle */
import { waitForEvent } from 'streamr-test-utils'

import { Event, DisconnectionReason, DisconnectionCode } from '../../src/connection/IWsEndpoint' 
import { startEndpoint, WebSocketEndpoint } from '../../src/connection/WebSocketEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

const STATE_OPEN = 1
const STATE_CLOSING = 2

describe('check and kill dead connections', () => {
    let node1: WebSocketEndpoint
    let node2: WebSocketEndpoint

    beforeEach(async () => {
        node1 = await startEndpoint('127.0.0.1', 43971, PeerInfo.newNode('node1'))
        node2 = await startEndpoint('127.0.0.1', 43972, PeerInfo.newNode('node2'))

        node1.connect('ws://127.0.0.1:43972')
        await waitForEvent(node1, Event.PEER_CONNECTED)
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
        expect(connection!.getReadyState()).toEqual(STATE_OPEN)

        // @ts-expect-error private method
        jest.spyOn(node1, 'onClose').mockImplementation()

        // check connections
        jest.spyOn(connection!, 'ping').mockImplementation(() => {
            throw new Error('mock error message')
        })
        // @ts-expect-error private method
        node1.pingConnections()

        expect(connection!.getReadyState()).toEqual(STATE_CLOSING)

        // @ts-expect-error private method
        expect(node1.onClose).toBeCalledTimes(1)
        // @ts-expect-error private method
        expect(node1.onClose).toBeCalledWith('ws://127.0.0.1:43972', PeerInfo.newNode('node2'),
            DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)

        // @ts-expect-error private method
        node1.onClose.mockRestore()
        // @ts-expect-error private method
        node1.pingConnections()

        const [peerInfo] = await waitForEvent(node1, Event.PEER_DISCONNECTED)
        expect(peerInfo).toEqual(PeerInfo.newNode('node2'))
    })
})
