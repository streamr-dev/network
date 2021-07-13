/* eslint-disable no-underscore-dangle */
import { waitForEvent } from 'streamr-test-utils'

import { ServerWsEndpoint } from '../../src/connection/ws/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { NodeClientWsEndpoint } from '../../src/connection/ws/NodeClientWsEndpoint'
import { Event } from "../../src/connection/ws/AbstractWsEndpoint"
import { startServerWsEndpoint } from '../utils'

const STATE_OPEN = 1

describe('check and kill dead connections', () => {
    let clientEndpoint: NodeClientWsEndpoint
    let serverEndpoint: ServerWsEndpoint
    const trackerPeerInfo =  PeerInfo.newTracker('serverEndpoint')
    beforeEach(async () => {
        clientEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('clientEndpoint'))
        serverEndpoint = await startServerWsEndpoint('127.0.0.1', 43972, trackerPeerInfo)
        await clientEndpoint.connect('ws://127.0.0.1:43972', trackerPeerInfo)
    })

    afterEach(async () => {
        Promise.allSettled([
            clientEndpoint.stop(),
            serverEndpoint.stop()
        ])
    })

    it('if we find dead connection, we force close it', async () => {
        expect(clientEndpoint.getPeers().size).toBe(1)

        // get alive connection
        const connection = clientEndpoint.getPeers().get('serverEndpoint')
        expect(connection!.getReadyState()).toEqual(STATE_OPEN)

        // check connections
        jest.spyOn(connection!, 'ping').mockImplementation(() => {
            throw new Error('mock error message')
        })

        const event = waitForEvent(clientEndpoint, Event.PEER_DISCONNECTED)
        // @ts-expect-error private method
        clientEndpoint.pingPongWs.pingConnections()
        const [peerInfo, reason] = await event

        expect(peerInfo).toEqual(PeerInfo.newTracker('serverEndpoint'))
        expect(reason).toEqual('')
    })
})
