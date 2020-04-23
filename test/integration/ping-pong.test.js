const { startTracker, startStorageNode } = require('streamr-network')
const { waitForCondition } = require('streamr-test-utils')
const uWS = require('uWebSockets.js')

const { createClient } = require('../utils')
const StreamFetcher = require('../../src/StreamFetcher')
const WebsocketServer = require('../../src/websocket/WebsocketServer')
const Publisher = require('../../src/Publisher')
const VolumeLogger = require('../../src/VolumeLogger')
const SubscriptionManager = require('../../src/SubscriptionManager')

const trackerPort = 17370
const wsPort = 17351
const networkNodePort = 17361

describe('ping-pong test between broker and clients', () => {
    let tracker
    let websocketServer
    let networkNode

    let client1
    let client2
    let client3

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        networkNode = await startStorageNode('127.0.0.1', networkNodePort, 'networkNode')

        const volumeLogger = new VolumeLogger(0)
        websocketServer = new WebsocketServer(
            uWS.App(),
            wsPort,
            networkNode,
            new StreamFetcher('http://localhost:8081/streamr-core'),
            new Publisher(networkNode, volumeLogger),
            volumeLogger,
            new SubscriptionManager(networkNode)
        )

        client1 = createClient(wsPort, 'tester1-api-key')
        await client1.ensureConnected()

        client2 = createClient(wsPort, 'tester1-api-key')
        await client2.ensureConnected()

        client3 = createClient(wsPort, 'tester1-api-key')
        await client3.ensureConnected()

        await waitForCondition(() => websocketServer.connections.size === 3)
    })

    afterEach(async () => {
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await client3.ensureDisconnected()

        await tracker.stop()
        await networkNode.stop()
        await websocketServer.close()
    })

    it('websocketServer sends pings and receives pongs from clients', async () => {
        let pings = 0

        const connections = [...websocketServer.connections.values()]
        connections.forEach((connection) => {
            expect(connection.isAlive).toBeUndefined()
        })

        client1.connection.socket.on('ping', () => {
            pings += 1
        })

        client2.connection.socket.on('ping', () => {
            pings += 1
        })

        client3.connection.socket.on('ping', () => {
            pings += 1
        })

        // eslint-disable-next-line no-underscore-dangle
        websocketServer._pingConnections()
        await waitForCondition(() => pings === 3)

        expect(pings).toEqual(3)

        expect(websocketServer.connections.size).toEqual(3)
        connections.forEach((connection) => {
            expect(connection.respondedPong).toBeTruthy()
        })
    })

    it('websocketServer closes connections, which are not replying with pong', async (done) => {
        let pings = 0

        client1.connection.socket.pong = () => {
            // don't send back pong
        }

        client2.connection.socket.on('ping', () => {
            pings += 1
        })

        client3.connection.socket.on('ping', () => {
            pings += 1
        })

        // eslint-disable-next-line no-underscore-dangle
        websocketServer._pingConnections()
        await waitForCondition(() => pings === 2)

        const connections = [...websocketServer.connections.values()]
        expect(connections.length).toEqual(3)
        connections.forEach((connection, index) => {
            // first client
            if (index === 0) {
                expect(connection.respondedPong)
                    .toBeFalsy()
            } else {
                expect(connection.respondedPong)
                    .toBeTruthy()
            }
        })

        client1.on('disconnected', () => {
            // TODO replace with () => done, after fixing stopping of JS client
            client1.on('connected', done)
        })

        // eslint-disable-next-line no-underscore-dangle
        websocketServer._pingConnections()
    })
})
