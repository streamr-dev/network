import { Connection } from '../../../../src/plugins/legacyWebsocket/Connection'
import { Stream } from '../../../../src/Stream'
import { EventEmitter } from "events"
import WebSocket from "ws"
import { Protocol } from "streamr-network"
import { waitForCondition, waitForEvent } from 'streamr-test-utils'
import Mock = jest.Mock
import { ErrorResponse } from '../../../../../protocol/src'

class FakeWebSocket extends EventEmitter {
    send: Mock
    close: Mock
    terminate: Mock
    constructor() {
        super()
        this.send = jest.fn()
        this.close = jest.fn()
        this.terminate = jest.fn()
    }
}

class FakeDuplexStream extends EventEmitter {
    write: Mock
    constructor() {
        super()
        this.write = jest.fn().mockReturnValue(true) // return value is backpressure signal
    }
}

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
        connection = new Connection(fakeSocket as unknown as WebSocket, controlLayerVersion, messageLayerVersion)
        // @ts-expect-error violate private
        connection.duplexStream = fakeDuplexStream
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
        const WAIT_TIME_FOR_NO_EVENT = 100 // how long to wait before deciding that an event did not occur
        const subscribeRequest = new Protocol.ControlLayer.SubscribeRequest({
            requestId: 'requestId',
            streamId: 'streamId',
            streamPartition: 0,
            sessionToken: 'sessionToken'
        })

        it('emitted when receiving valid message', async () => {
            const messageEvent = waitForEvent(connection, 'message')
            fakeSocket.emit('message', subscribeRequest.serialize())
            const [receivedMessage] = await messageEvent
            expect(receivedMessage).toEqual(subscribeRequest)
        })

        it('not emitted if connection marked as dead', async () => {
            connection.forceClose('test')
            const messageEvent = waitForEvent(connection, 'message', WAIT_TIME_FOR_NO_EVENT)
            fakeSocket.emit('message', subscribeRequest.serialize())
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
})
