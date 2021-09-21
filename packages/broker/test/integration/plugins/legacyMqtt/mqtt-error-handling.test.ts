import { AsyncMqttClient } from 'async-mqtt'
import { Socket } from 'net'
import { startTracker, Tracker } from 'streamr-network'
import {waitForEvent} from '../../../../../test-utils/dist/utils'
import { Broker } from '../../../broker'
import { startBroker, createMqttClient } from '../../../utils'

const trackerPort = 12411
const mqttPort = 12413

describe('MQTT error handling', () => {
    let tracker: Tracker
    let broker: Broker
    let mqttClient: AsyncMqttClient

    async function setUpBroker(broken = false) {
        // eslint-disable-next-line require-atomic-updates
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x4e850f1940b1901ca926f20e121f40ba6f6730eaae655d827f48eccf01e32f40',
            trackerPort,
            legacyMqttPort: mqttPort,
            streamrUrl: broken ? 'http://non-existing-url-666' : undefined
        })
    }

    beforeEach(async () => {
        if (tracker) { return }

        // eslint-disable-next-line require-atomic-updates
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
    })

    afterAll(async () => {
        await tracker?.stop()
    })

    afterEach(async () => {
        if (mqttClient) {
            await mqttClient.end(true)
        }
    })

    afterEach(async () => {
        await broker?.stop()
    })

    describe('with valid broker', () => {
        beforeEach(async () => {
            await setUpBroker()
        })

        describe('with sockets', () => {
            let socket: Socket
            let newSocket: Socket

            afterEach(async () => {
                if (socket) {
                    socket.destroy()
                }

                if (newSocket) {
                    newSocket.destroy()
                }
            })

            test('sending unrecognized packets causes client to be dropped without server crashing', async () => {
                socket = new Socket()

                socket.connect(mqttPort, '127.0.0.1', () => {
                    for (let i = 0; i < 100; ++i) {
                        socket.write('nonsensepackage\r\n')
                    }
                })

                const [hadError] = await waitForEvent(socket, 'close')
                // Make sure we didn't close with error
                expect(hadError).toEqual(false)

                await new Promise((resolve, reject) => {
                    // Ensure that server is indeed still up
                    newSocket = new Socket()
                    newSocket.once('error', reject)
                    newSocket.connect(mqttPort, '127.0.0.1', () => resolve(undefined))
                })
            })
        })

        it('test no password given', async () => {
            mqttClient = createMqttClient(mqttPort, 'localhost', null as any)
            const [err] = await waitForEvent(mqttClient, 'error')
            expect(err && (err as Error).message).toEqual('Connection refused: Bad username or password')
        })

        it('test not valid private key', async () => {
            mqttClient = createMqttClient(mqttPort, 'localhost', 'NOT_VALID_PRIVATE_KEY')

            const [err] = await waitForEvent(mqttClient, 'error')
            expect(err && (err as Error).message).toEqual('Connection refused: Bad username or password')
        })

        it('test valid authentication without permissions to stream', async () => {
            mqttClient = createMqttClient(mqttPort)
            // listen for errors before publishing
            const errTask = waitForEvent(mqttClient, 'error')
            errTask.catch(() => {}) // handle later
            // note the promise publish returns doesn't seem to resolve if there's an error?
            mqttClient.publish('NOT_VALID_STREAM', 'key: 1', {
                qos: 1
            })
            const [err] = await errTask
            expect(err && (err as Error).message).toEqual('Connection refused: Not authorized')
        })
    })

    describe('with invalid broker', () => {
        beforeEach(async () => {
            await setUpBroker(true)
        })

        it('test streamFetcher service unavailable', async () => {
            mqttClient = createMqttClient(mqttPort)
            const [err] = await waitForEvent(mqttClient, 'error')
            expect(err && (err as Error).message).toEqual('Connection refused: Server unavailable')
        })
    })
})
