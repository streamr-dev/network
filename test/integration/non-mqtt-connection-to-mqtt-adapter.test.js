const net = require('net')

const { startTracker } = require('@streamr/streamr-p2p-network')

const createBroker = require('../../src/broker')

const trackerPort = 12411
const brokerPort = 12412
const mqttPort = 12413

describe('non-mqtt connection to MQTT adapter', () => {
    let tracker
    let broker

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker = await createBroker({
            network: {
                id: 'broker',
                hostname: '127.0.0.1',
                port: brokerPort,
                advertisedWsUrl: null,
                tracker: `ws://127.0.0.1:${trackerPort}`,
                isStorageNode: false
            },
            cassandra: false,
            reporting: false,
            streamrUrl: 'http://localhost:8081/streamr-core',
            adapters: [
                {
                    name: 'mqtt',
                    port: mqttPort,
                    streamsTimeout: 300000
                }
            ],
        })
    })

    afterEach(async () => {
        broker.close()
        tracker.stop()
    })

    test('sending unrecognized packets causes client to be dropped without server crashing', (done) => {
        const socket = new net.Socket()

        function close(s1, s2, cb) {
            s1.destroy()
            s2.destroy()
            cb
        }

        socket.connect(mqttPort, '127.0.0.1', () => {
            for (let i = 0; i < 100; ++i) {
                socket.write('nonsensepackage\r\n')
            }
        })

        socket.on('close', (hadError) => {
            // Make sure we didn't close with error
            expect(hadError).toEqual(false)

            // Ensure that server is indeed still up
            const newSocket = new net.Socket()
            newSocket.on('error', (err) => {
                close(socket, newSocket, done(err))
            })
            newSocket.connect(mqttPort, '127.0.0.1', () => {
                close(socket, newSocket, done())
            })
        })
    })
})
