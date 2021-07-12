import { Tracker } from '../../src/logic/Tracker'
import WebSocket from 'ws'
import {waitForEvent, wait, waitForCondition, runAndWaitForEvents} from 'streamr-test-utils'

import { ServerWsEndpoint } from '../../src/connection/ws/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker } from '../../src/composition'
import { BrowserClientWsEndpoint } from '../../src/connection/ws/BrowserClientWsEndpoint'
import { DisconnectionCode, Event } from "../../src/connection/ws/AbstractWsEndpoint"
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
            expect(Object.keys(endpoints[i].getPeers()).length).toBe(0)
        }
        const clients = []
        const promises: Promise<any>[] = []
        for (let i = 0; i < 5; i++) {
            const client = new BrowserClientWsEndpoint(PeerInfo.newNode(`client-${i}`))

            //const nextEndpoint = i + 1 === 5 ? endpoints[0] : endpoints[i + 1]

            // eslint-disable-next-line no-await-in-loop

            await runAndWaitForEvents([
                () => {
                    client.connect(endpoints[i].getUrl(), PeerInfo.newTracker('tracker'))
                }], [
                [client, Event.PEER_CONNECTED]
            ])
            clients.push(client)
        }
        await wait(2000)
        for (let i = 0; i < 5; i++) {
            console.log(clients[i].getPeers())
            // console.log(endpoints[i].getPeers())
            // await waitForCondition(() => Object.keys(endpoints[i].getPeers()).length === 1)
        }

        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await endpoints[i].stop()
            await clients[i].stop()
        }
    })

    // it('server and client form correct peerInfo on connection', async () => {
    //     const client = new BrowserClientWsEndpoint(PeerInfo.newNode('client'))
    //     const server = await startServerWsEndpoint('127.0.0.1', 30696, PeerInfo.newNode('server'))
    //
    //     const e1 = waitForEvent(client, Event.PEER_CONNECTED)
    //     const e2 = waitForEvent(server, Event.PEER_CONNECTED)
    //
    //     await client.connect(server.getUrl(). PeerInfo.newTracker('server'))
    //
    //     const clientArguments = await e1
    //     const serverArguments = await e2
    //
    //     expect(clientArguments).toEqual([PeerInfo.newTracker('server')])
    //     expect(serverArguments).toEqual([PeerInfo.newNode('client')])
    //
    //     await client.stop()
    //     await server.stop()
    // })

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
