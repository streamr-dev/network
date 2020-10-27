const net = require('net')

const { startTracker } = require('streamr-network')

const { startBroker } = require('../utils')

const trackerPort = 12411
const networkPort = 12412
const mqttPort = 12413

describe('non-mqtt connection to MQTT adapter', () => {
    let tracker
    let broker

    let socket
    let newSocket

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x4e850f1940b1901ca926f20e121f40ba6f6730eaae655d827f48eccf01e32f40',
            networkPort,
            trackerPort,
            mqttPort
        })
    })

    afterEach(async () => {
        socket.destroy()

        if (newSocket) {
            newSocket.destroy()
        }

        broker.close()
        await tracker.stop()
    })

    test('sending unrecognized packets causes client to be dropped without server crashing', (done) => {
        socket = new net.Socket()

        socket.connect(mqttPort, '127.0.0.1', () => {
            for (let i = 0; i < 100; ++i) {
                socket.write('nonsensepackage\r\n')
            }
        })

        socket.on('close', (hadError) => {
            // Make sure we didn't close with error
            expect(hadError).toEqual(false)

            // Ensure that server is indeed still up
            newSocket = new net.Socket()
            newSocket.on('error', (err) => {
                done(err)
            })
            newSocket.connect(mqttPort, '127.0.0.1', () => {
                done()
            })
        })
    })
})
