import { Tracker } from '../../src/logic/Tracker'
import WebSocket from 'ws'
import { waitForEvent, wait } from 'streamr-test-utils'

import { ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker } from '../../src/composition'
import { ClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'
import { DisconnectionCode, Event } from "../../src/connection/AbstractWsEndpoint"
import { startServerWsEndpoint } from '../utils'

describe('ws-endpoint', () => {
    const endpoints: ServerWsEndpoint[] = []

    it('create five endpoints and init connection between them, should be able to start and stop successfully', async () => {
        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            const endpoint = await startServerWsEndpoint('127.0.0.1', 30690 + i, PeerInfo.newNode(`endpoint-${i}`))
                .catch((err) => {
                    throw err
                })
            endpoints.push(endpoint)
        }

        for (let i = 0; i < 5; i++) {
            expect(endpoints[i].getPeers().size).toBe(0)
        }
        const clients = []
        const promises: Promise<any>[] = []
        for (let i = 0; i < 5; i++) {
            const client = new ClientWsEndpoint(PeerInfo.newNode(`client-${i}`))

            promises.push(waitForEvent(endpoints[i], Event.PEER_CONNECTED))

            //const nextEndpoint = i + 1 === 5 ? endpoints[0] : endpoints[i + 1]

            // eslint-disable-next-line no-await-in-loop
            client.connect(endpoints[i].getUrl())
            clients.push(client)
        }

        await Promise.all(promises)
        await wait(100)

        for (let i = 0; i < 5; i++) {
            expect(endpoints[i].getPeers().size).toEqual(1)
        }

        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await endpoints[i].stop()
            await clients[i].stop()
        }
    })

    it('server and client form correct peerInfo on connection', async () => {
        const client = new ClientWsEndpoint(PeerInfo.newNode('client'))
        const server = await startServerWsEndpoint('127.0.0.1', 30696, PeerInfo.newNode('server'))

        const e1 = waitForEvent(client, Event.PEER_CONNECTED)
        const e2 = waitForEvent(server, Event.PEER_CONNECTED)

        client.connect(server.getUrl())

        const clientArguments = await e1
        const serverArguments = await e2

        expect(clientArguments).toEqual([PeerInfo.newTracker('server')])
        expect(serverArguments).toEqual([PeerInfo.newNode('client')])

        await client.stop()
        await server.stop()
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

        it('tracker checks that peerId is given by incoming connections', async () => {
            const ws = new WebSocket(`ws://127.0.0.1:${trackerPort}/ws`,
                undefined, {
                    headers: {}
                })
            const close = await waitForEvent(ws, 'close')
            expect(close).toEqual([DisconnectionCode.MISSING_REQUIRED_PARAMETER, 'Error: peerId not given'])
        })
    })
})
