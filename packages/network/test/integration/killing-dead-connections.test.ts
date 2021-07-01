/* eslint-disable no-underscore-dangle */
import { runAndWaitForEvents, waitForEvent } from 'streamr-test-utils'

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

        await runAndWaitForEvents(
            ()=> { node1.connect('ws://127.0.0.1:43972') },
            [node1, Event.PEER_CONNECTED]
        )
    })

    afterEach(async () => {
        Promise.allSettled([
            node1.stop(),
            node2.stop()
        ])
    })

    it('if we find dead connection, we force close it', (done) => {
        expect(node1.getPeers().size).toBe(1)

        // get alive connection
        const connection = node1.getPeers().get('ws://127.0.0.1:43972')
        expect(connection!.getReadyState()).toEqual(STATE_OPEN)


        node2.on(Event.PEER_DISCONNECTED, (peerInfo) => {
            console.log('received peer disconnected')
            expect(peerInfo).toEqual(PeerInfo.newNode('node1'))
            done()
        })

        // @ts-expect-error private method
        jest.spyOn(connection, 'emitClose').mockImplementation()

        // check connections
        jest.spyOn(connection!, 'ping').mockImplementation(() => {
            connection!.close(DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
        })
       
       
        // @ts-expect-error private method
        connection.ping()
       
        // @ts-expect-error private method
        expect(connection.emitClose).toBeCalledTimes(1)
        
        // @ts-expect-error private method
        expect(connection.emitClose).toBeCalledWith(
             DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)

        expect(connection!.getReadyState()).toEqual(STATE_CLOSING)
        
    })
})
