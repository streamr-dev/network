import { Connection } from '../../../../src/plugins/legacyWebsocket/Connection'
import { Stream } from '../../../../src/Stream'
import { EventEmitter } from "events"
import WebSocket from "ws"
import { Protocol } from "streamr-network"
import { waitForCondition, waitForEvent } from 'streamr-test-utils'
import Mock = jest.Mock
import { ErrorResponse } from '../../../../../protocol/src'
import stream from 'stream'

class FakeWebSocket extends EventEmitter {
    send: Mock
    close: Mock
    terminate: Mock
    ping: Mock
    constructor() {
        super()
        this.send = jest.fn()
        this.close = jest.fn()
        this.terminate = jest.fn()
        this.ping = jest.fn()
    }
}

class FakeDuplexStream extends EventEmitter {
    write: Mock
    constructor() {
        super()
        this.write = jest.fn().mockReturnValue(true) // return value is backpressure signal
    }
}

// Just any protocol message really, content doesn't matter
const protocolMessage = new Protocol.ControlLayer.SubscribeRequest({
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 0,
    sessionToken: 'sessionToken'
})

const WAIT_TIME_FOR_NO_EVENT = 100 // how long to wait before deciding that an event did not occur

describe('Connection', () => {
    let controlLayerVersion: number
    let messageLayerVersion: number
    let fakeSocket: FakeWebSocket
    let fakeDuplexStream: FakeDuplexStream
    let connection: Connection

    beforeEach(() => {
        controlLayerVersion = 2
        messageLayerVersion = 31
        fakeSocket = new FakeWebSocket()
        fakeDuplexStream = new FakeDuplexStream()
        connection = new Connection(
            fakeSocket as unknown as WebSocket,
            fakeDuplexStream as unknown as stream.Duplex,
            controlLayerVersion,
            messageLayerVersion
        )
    })

    it('id is assigned', () => {
        expect(connection.id).toEqual('socketId-1')
    })

    it('starts alive, and having "responded to pongs"', () => {
        expect(connection.isDead()).toEqual(false)
        expect(connection.hasRespondedToPong()).toEqual(true)
    })

    describe('stream management', () => {
        describe('addStream', () => {
            it('adds stream to the connection', () => {
                const stream1 = new Stream('stream', 0, '')
                const stream2 = new Stream('stream', 1, '')
                connection.addStream(stream1)
                connection.addStream(stream2)
                expect(connection.getStreams()).toEqual([stream1, stream2])
            })
        })

        describe('removeStream', () => {
            let stream1: Stream
            let stream2: Stream
            let stream3: Stream

            beforeEach(() => {
                stream1 = new Stream('stream1', 0, '')
                stream2 = new Stream('stream2', 0, '')
                stream3 = new Stream('stream3', 0, '')
                connection.addStream(stream1)
                connection.addStream(stream2)
                connection.addStream(stream3)
            })

            it('removes a stream if it is present', () => {
                connection.removeStream('stream2', 0)
                expect(connection.getStreams()).toEqual([stream1, stream3])
            })

            it('keeps streams intact if not present', () => {
                connection.removeStream('stream4', 0)
                expect(connection.getStreams()).toEqual([stream1, stream2, stream3])
            })
        })

        describe('getStreams', () => {
            it('returns a copy of the array', () => {
                connection.addStream(new Stream('stream1', 0, ''))
                connection.addStream(new Stream('stream2', 0, ''))
                connection.addStream(new Stream('stream3', 0, ''))

                connection.getStreams().push(new Stream('stream4', 0, ''))
                expect(connection.getStreams()).toHaveLength(3)
            })
        })

        describe('streamsAsString', () => {
            it('returns an array of string representation of the streams', () => {
                connection.addStream(new Stream('stream1', 0, ''))
                connection.addStream(new Stream('stream2', 0, ''))
                connection.addStream(new Stream('stream3', 0, ''))
                expect(connection.streamsAsString()).toEqual([
                    'stream1::0',
                    'stream2::0',
                    'stream3::0',
                ])
            })
        })

        describe('forEachStream', () => {
            it('iterates over each stream', () => {
                const stream1 = new Stream('stream1', 0, '')
                const stream2 = new Stream('stream2', 0, '')
                const stream3 = new Stream('stream3', 0, '')
                connection.addStream(stream1)
                connection.addStream(stream2)
                connection.addStream(stream3)
                const cbFn = jest.fn()
                connection.forEachStream(cbFn)
                expect(cbFn).toHaveBeenCalledTimes(3)
                expect(cbFn).toHaveBeenCalledWith(stream1, 0, [stream1, stream2, stream3])
                expect(cbFn).toHaveBeenCalledWith(stream2, 1, [stream1, stream2, stream3])
                expect(cbFn).toHaveBeenCalledWith(stream3, 2, [stream1, stream2, stream3])
            })
        })
    })

    describe('send()', () => {
        it('writes a serialized message to the socket', () => {
            const msg: any = {
                serialize: (controlVersion: number, messageVersion: number) => `msg:${controlVersion}:${messageVersion}`,
            }
            connection.send(msg)
            expect(fakeDuplexStream.write).toHaveBeenCalledTimes(1)
            expect(fakeDuplexStream.write).toHaveBeenCalledWith(msg.serialize(controlLayerVersion, messageLayerVersion))
        })

        it('terminates connection if writing message to socket throws', () => {
            fakeDuplexStream.write.mockImplementation(() => {
                throw new Error('ERROR ERROR')
            })
            connection.send(protocolMessage)
            expect(fakeSocket.terminate).toHaveBeenCalledTimes(1)
            expect(connection.isDead()).toEqual(true)
        })
    })

    describe('ping()', () => {
        it('delegates to socket#ping', () => {
            connection.ping()
            expect(fakeSocket.ping).toHaveBeenCalledTimes(1)
        })
    })

    describe('close()', () => {
        it('closes underlying socket gracefully', () => {
            connection.close()
            expect(fakeSocket.close).toHaveBeenCalledTimes(1)
        })

        it('marks connection as dead', () => {
            connection.close()
            expect(connection.isDead()).toEqual(true)
        })

        it('suppresses exception thrown by socket.close', () => {
            fakeSocket.close = jest.fn().mockImplementation(() => {
                throw new Error('ERROR ERROR')
            })
            connection.close()
            expect(connection.isDead()).toEqual(true)
        })
    })

    describe('forceClose()', () => {
        it('terminates underlying socket forcefully', () => {
            connection.forceClose('reason')
            expect(fakeSocket.terminate).toHaveBeenCalledTimes(1)
        })

        it('marks connection as dead', () => {
            connection.forceClose('reason')
            expect(connection.isDead()).toEqual(true)
        })

        it('suppresses exception thrown by socket.close', () => {
            fakeSocket.terminate = jest.fn().mockImplementation(() => {
                throw new Error('ERROR ERROR')
            })
            connection.forceClose('reason')
            expect(connection.isDead()).toEqual(true)
        })
    })

    describe('event: message', () => {
        it('emitted when receiving valid message', async () => {
            const messageEvent = waitForEvent(connection, 'message')
            fakeSocket.emit('message', protocolMessage.serialize())
            const [receivedMessage] = await messageEvent
            expect(receivedMessage).toEqual(protocolMessage)
        })

        it('not emitted if connection marked as dead', async () => {
            connection.forceClose('test')
            const messageEvent = waitForEvent(connection, 'message', WAIT_TIME_FOR_NO_EVENT)
            fakeSocket.emit('message', protocolMessage.serialize())
            await expect(messageEvent).rejects
                .toEqual(new Error(`Promise timed out after ${WAIT_TIME_FOR_NO_EVENT} milliseconds`))
        })

        it('not emitted if invalid message', async () => {
            const messageEvent = waitForEvent(connection, 'message', WAIT_TIME_FOR_NO_EVENT)
            fakeSocket.emit('message', 'INVALID_MESSAGE_INCOMING')
            await expect(messageEvent).rejects
                .toEqual(new Error(`Promise timed out after ${WAIT_TIME_FOR_NO_EVENT} milliseconds`))
        })
    })

    describe('event: close', () => {
        it('emitted when underlying socket emits close', async () => {
            const closeEvent = waitForEvent(connection, 'close')
            fakeSocket.emit('close')
            await closeEvent
        })

        it('emitted when gracefully closing connection', async () => {
            const closeEvent = waitForEvent(connection, 'close')
            connection.close()
            await closeEvent
        })

        it('emitted when forcefully closing connection', async () => {
            const closeEvent = waitForEvent(connection, 'close')
            connection.forceClose('test')
            await closeEvent
        })
    })

    describe('event: highBackPressure', () => {
        it('emitted within send() if duplexStream.write returns with false', async () => {
            fakeDuplexStream.write.mockReturnValue(false) // false = "backpressure accumulated"
            const highBackPressureEvent = waitForEvent(connection, 'highBackPressure')
            connection.send(protocolMessage)
            await highBackPressureEvent
        })

        it('not emitted within send() if duplexStream.write returns with true', async () => {
            fakeDuplexStream.write.mockReturnValue(true) // true = "go ahead and publish more"
            const highBackPressureEvent = waitForEvent(connection, 'highBackPressure', WAIT_TIME_FOR_NO_EVENT)
            connection.send(protocolMessage)
            await expect(highBackPressureEvent).rejects
                .toEqual(new Error(`Promise timed out after ${WAIT_TIME_FOR_NO_EVENT} milliseconds`))
        })
    })

    describe('event: lowBackPressure', () => {
        it('emitted when duplexStream emits event "drain"', async () => {
            const lowBackPressureEvent = waitForEvent(connection, 'lowBackPressure')
            fakeDuplexStream.emit('drain')
            await lowBackPressureEvent
        })
    })

    it('responds with an error if received invalid message from socket', async () => {
        fakeSocket.emit('message', 'INVALID_MESSAGE_INCOMING')
        await waitForCondition(() => fakeDuplexStream.write.mock.calls.length !== 0)
        expect(fakeDuplexStream.write).toHaveBeenCalledTimes(1)
        expect(fakeDuplexStream.write).toHaveBeenCalledWith(new ErrorResponse({
            requestId: '',
            errorMessage: 'Unexpected token I in JSON at position 0',
            errorCode: Protocol.ErrorCode.INVALID_REQUEST
        }).serialize())
    })

    it('hasRespondedPong set back to true upon receiving pong from socket', () => {
        connection.setRespondedToPongAsFalse()
        expect(connection.hasRespondedToPong()).toEqual(false)

        fakeSocket.emit('pong')
        expect(connection.hasRespondedToPong()).toEqual(true)
    })
})
