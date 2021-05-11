import { AsyncMqttClient } from 'async-mqtt'
import net from 'net'
import { startTracker } from 'streamr-network'
import { Todo } from '../types'
import { startBroker, createMqttClient } from '../utils'

const trackerPort = 12411
const networkPort = 12412
const mqttPort = 12413

describe('MQTT error handling', () => {
    let tracker: Todo
    let broker: Todo
    let socket: Todo
    let newSocket: Todo
    let mqttClient: AsyncMqttClient

    async function setUpBroker(broken = false) {
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x4e850f1940b1901ca926f20e121f40ba6f6730eaae655d827f48eccf01e32f40',
            networkPort,
            trackerPort,
            mqttPort,
            streamrUrl: broken ? 'http://non-existing-url-666' : undefined
        })
    }

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
    })

    afterEach(async () => {
        if (socket) {
            socket.destroy()
        }

        if (newSocket) {
            newSocket.destroy()
        }

        if (mqttClient) {
            mqttClient.end(true)
        }

        await broker.close()
        await tracker.stop()
    })

    test('sending unrecognized packets causes client to be dropped without server crashing', (done) => {
        setUpBroker(false).then(() => {
            socket = new net.Socket()

            socket.connect(mqttPort, '127.0.0.1', () => {
                for (let i = 0; i < 100; ++i) {
                    socket.write('nonsensepackage\r\n')
                }
            })

            socket.on('close', (hadError: boolean) => {
                // Make sure we didn't close with error
                expect(hadError).toEqual(false)

                // Ensure that server is indeed still up
                newSocket = new net.Socket()
                newSocket.on('error', (err: Todo) => {
                    done(err)
                })
                newSocket.connect(mqttPort, '127.0.0.1', () => {
                    done()
                })
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    it('test no password given', (done) => {
        setUpBroker(false).then(() => {
            mqttClient = createMqttClient(mqttPort, 'localhost', null as any)
            mqttClient.on('error', (err) => {
                expect(err.message).toEqual('Connection refused: Bad username or password')
                mqttClient.end(true)
                done()
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    it('test not valid private key', (done) => {
        setUpBroker(false).then(() => {
            mqttClient = createMqttClient(mqttPort, 'localhost', 'NOT_VALID_PRIVATE_KEY')
            mqttClient.on('error', (err) => {
                expect(err.message).toEqual('Connection refused: Bad username or password')
                mqttClient.end(true)
                done()
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    it('test streamFetcher service unavailable', (done) => {
        setUpBroker(true).then(() => {
            mqttClient = createMqttClient(mqttPort)
            mqttClient.on('error', (err) => {
                expect(err.message).toEqual('Connection refused: Server unavailable')
                mqttClient.end(true)
                done()
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })

    it('test valid authentication without permissions to stream', (done) => {
        setUpBroker(false).then(() => {
            mqttClient = createMqttClient(mqttPort)
            mqttClient.on('error', (err) => {
                expect(err.message).toEqual('Connection refused: Not authorized')
                done()
            })
            mqttClient.publish('NOT_VALID_STREAM', 'key: 1', {
                qos: 1
            })
        }).catch((err) => {
            done(err ?? new Error('test fail'))
        })
    })
})
