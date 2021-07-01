import { startTracker, createNetworkNode, MetricsContext, NetworkNode } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import uWS from 'uWebSockets.js'
import StreamrClient from 'streamr-client'
import { StreamFetcher } from '../../../../src/StreamFetcher'
import { WebsocketServer } from '../../../../src/plugins/legacyWebsocket/WebsocketServer'
import { Publisher } from '../../../../src/Publisher'
import { SubscriptionManager } from '../../../../src/SubscriptionManager'
import { Todo } from '../../../../src/types'
import { createClient } from '../../../utils'

const trackerPort = 17370
const wsPort = 17351

describe('ping-pong test between broker and clients', () => {
    let tracker: Todo
    let websocketServer: WebsocketServer
    let networkNode: NetworkNode
    let metricsContext: MetricsContext
    let client1: StreamrClient
    let client2: StreamrClient
    let client3: StreamrClient

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
    })

    beforeEach(async () => {
        networkNode = createNetworkNode({
            id: 'networkNode',
            trackers: [tracker.getUrl()]
        })
        networkNode.start()
        metricsContext = new MetricsContext(null as any)
        websocketServer = new WebsocketServer(
            uWS.App(),
            wsPort,
            networkNode,
            new StreamFetcher('http://127.0.0.1'),
            new Publisher(networkNode, {}, metricsContext),
            metricsContext,
            new SubscriptionManager(networkNode),
            undefined as any,
            undefined as any
        )
    })

    beforeEach(async () => {
        client1 = createClient(wsPort)
        client2 = createClient(wsPort)
        client3 = createClient(wsPort)

        await Promise.all([
            client1.ensureConnected(),
            client2.ensureConnected(),
            client3.ensureConnected()
        ])
    })

    beforeEach(async () => {
        await waitForCondition(() => websocketServer.connections.size === 3)
    })

    afterEach(async () => {
        await Promise.all([
            client1.ensureDisconnected(),
            client2.ensureDisconnected(),
            client3.ensureDisconnected()
        ])

        await tracker.stop()
        await networkNode.stop()
        await websocketServer.close()
    })

    it('websocketServer sends pings and receives pongs from clients', async () => {
        let pings = 0

        const connections = [...websocketServer.connections.values()]
        connections.forEach((connection) => {
            // @ts-expect-error
            expect(connection.isAlive).toBeUndefined()
        })

        // @ts-expect-error
        client1.connection.socket.on('ping', () => {
            pings += 1
        })

        // @ts-expect-error
        client2.connection.socket.on('ping', () => {
            pings += 1
        })

        // @ts-expect-error
        client3.connection.socket.on('ping', () => {
            pings += 1
        })

        // eslint-disable-next-line no-underscore-dangle
        websocketServer._pingConnections()
        await waitForCondition(() => pings === 3)

        expect(pings).toEqual(3)
        expect(websocketServer.connections.size).toEqual(3)
        // @ts-expect-error
        await waitForCondition(() => connections.every((connection) => (connection.respondedPong === true)))
        connections.forEach((connection) => {
            // @ts-expect-error
            expect(connection.respondedPong).toBeTruthy()
        })
    })

    it('websocketServer closes connections, which are not replying with pong', (done) => {
        let pings = 0

        // @ts-expect-error
        client1.connection.socket.pong = jest.fn() // don't send back pong

        // @ts-expect-error
        client2.connection.socket.on('ping', () => {
            pings += 1
        })

        // @ts-expect-error
        client3.connection.socket.on('ping', () => {
            pings += 1
        })

        // eslint-disable-next-line no-underscore-dangle
        websocketServer._pingConnections()
        waitForCondition(() => pings === 2).then(async () => {
            const connections = [...websocketServer.connections.values()]
            expect(connections.length).toEqual(3)
            await waitForCondition(() => {
                // @ts-expect-error
                const respondedPongCount = connections.filter((connection) => (connection.respondedPong === true)).length
                // @ts-expect-error
                return ((client1.connection.socket.pong.mock.calls.length === 1) && (respondedPongCount === 2))
            })
            connections.forEach((connection, index) => {
                // first client
                if (index === 0) {
                    // @ts-expect-error
                    expect(connection.respondedPong).toBeFalsy()
                } else {
                    // @ts-expect-error
                    expect(connection.respondedPong).toBeTruthy()
                }
            })

            client1.on('disconnected', () => {
                // TODO replace with () => done, after fixing stopping of JS client
                client1.on('connected', done)
            })

            // eslint-disable-next-line no-underscore-dangle
            websocketServer._pingConnections()
        }).catch((err) => {
            done(err)
        })
    })
})
