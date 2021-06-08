import { Tracker } from '../../src/logic/Tracker'
import WebSocket from 'ws'
import { waitForEvent, wait } from 'streamr-test-utils'

import { Event, DisconnectionCode } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker } from '../../src/composition'

describe('ws-endpoint', () => {
    const endpoints: WsEndpoint[] = []

    it('create five endpoints and init connection between them, should be able to start and stop successfully', async () => {
        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            const endpoint = await startEndpoint('127.0.0.1', 30690 + i, PeerInfo.newNode(`endpoint-${i}`), null)
                .catch((err) => {
                    throw err
                })
            endpoints.push(endpoint)
        }

        for (let i = 0; i < 5; i++) {
            expect(endpoints[i].getPeers().size).toBe(0)
        }

        const promises: Promise<any>[] = []

        for (let i = 0; i < 5; i++) {
            promises.push(waitForEvent(endpoints[i], Event.PEER_CONNECTED))

            const nextEndpoint = i + 1 === 5 ? endpoints[0] : endpoints[i + 1]

            // eslint-disable-next-line no-await-in-loop
            endpoints[i].connect(nextEndpoint.getAddress())
        }

        await Promise.all(promises)
        await wait(100)

        for (let i = 0; i < 5; i++) {
            expect(endpoints[i].getPeers().size).toEqual(2)
        }

        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await endpoints[i].stop()
        }
    })

    it('peer infos are exchanged between connecting endpoints', async () => {
        const endpointOne = await startEndpoint('127.0.0.1', 30695, PeerInfo.newNode('endpointOne'), null)
        const endpointTwo = await startEndpoint('127.0.0.1', 30696, PeerInfo.newNode('endpointTwo'), null)

        const e1 = waitForEvent(endpointOne, Event.PEER_CONNECTED)
        const e2 = waitForEvent(endpointTwo, Event.PEER_CONNECTED)

        endpointOne.connect(endpointTwo.getAddress())

        const endpointOneArguments = await e1
        const endpointTwoArguments = await e2

        const endpointOneInfo = PeerInfo.newNode('endpointOne')
        const endpointTwoInfo = PeerInfo.newNode('endpointTwo')

        expect(endpointOneArguments).toEqual([expect.objectContaining({
            peerId: endpointTwoInfo.peerId,
            peerType: endpointTwoInfo.peerType,
            controlLayerVersions: endpointTwoInfo.controlLayerVersions,
            messageLayerVersions: endpointTwoInfo.messageLayerVersions,
            peerName: endpointTwoInfo.peerName,
            location: endpointTwoInfo.location,        
        })])


        
        expect(endpointTwoArguments).toEqual([expect.objectContaining({
            peerId: endpointOneInfo.peerId,
            peerType: endpointOneInfo.peerType,
            controlLayerVersions: endpointOneInfo.controlLayerVersions,
            messageLayerVersions: endpointOneInfo.messageLayerVersions,
            peerName: endpointOneInfo.peerName,
            location: endpointOneInfo.location,        
        }),])

        await endpointOne.stop()
        await endpointTwo.stop()
    })

    describe('test direct connections from simple websocket', () => {
        const trackerPort = 38481
        let tracker: Tracker

        beforeEach(async () => {
            tracker = await startTracker({
                host: '127.0.0.1',
                port: trackerPort,
                id: 'tracker'
            })
        })

        afterEach(async () => {
            await tracker.stop()
        })

        it('tracker must check all required information for new incoming connection and not crash', async () => {
            let ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws`)
            let close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: address not given'])

            ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws?address`)
            close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: address not given'])

            ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws?address=address`)
            close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: peerId not given'])

            ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws?address=address`,
                undefined,
                {
                    headers: {
                        'streamr-peer-id': 'peerId',
                    }
                })
            close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: peerType not given'])

            ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws?address=address`,
                undefined, {
                    headers: {
                        'streamr-peer-id': 'peerId',
                        'streamr-peer-type': 'typiii',
                        'control-layer-versions': "2",
                        'message-layer-versions': "32"
                    }
                })
            close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: peerType typiii not in peerTypes list'])
        })
    })
})
