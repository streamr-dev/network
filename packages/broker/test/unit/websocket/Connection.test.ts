import { Connection } from '../../../src/websocket/Connection'
import { Stream } from '../../../src/Stream'
import { Todo } from '../../types'

let controlLayerVersion: number
let messageLayerVersion: number

describe('Connection', () => {
    let connection: Connection

    beforeEach(() => {
        controlLayerVersion = 2
        messageLayerVersion = 31
        connection = new Connection(undefined, controlLayerVersion, messageLayerVersion)
    })

    it('id is assigned', () => {
        expect(connection.id).toEqual('socketId-1')
    })

    describe('stream management', () => {
        describe('addStream', () => {
            it('adds stream to the connection', () => {
                // @ts-expect-error
                const stream0 = new Stream('stream', 0)
                // @ts-expect-error
                const stream2 = new Stream('stream', 1)
                connection.addStream(stream0)
                connection.addStream(stream2)
                expect(connection.getStreams()).toEqual([stream0, stream2])
            })
        })

        describe('removeStream', () => {
            let stream1: Stream
            let stream2: Stream
            let stream3: Stream

            beforeEach(() => {
                // @ts-expect-error
                stream1 = new Stream('stream1', 0)
                // @ts-expect-error
                stream2 = new Stream('stream2', 0)
                // @ts-expect-error
                stream3 = new Stream('stream3', 0)
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
                // @ts-expect-error
                connection.addStream(new Stream('stream1', 0))
                // @ts-expect-error
                connection.addStream(new Stream('stream2', 0))
                // @ts-expect-error
                connection.addStream(new Stream('stream3', 0))

                // @ts-expect-error
                connection.getStreams().push(new Stream('stream4', 0))
                expect(connection.getStreams()).toHaveLength(3)
            })
        })

        describe('streamsAsString', () => {
            it('returns an array of string representation of the streams', () => {
                // @ts-expect-error
                connection.addStream(new Stream('stream1', 0))
                // @ts-expect-error
                connection.addStream(new Stream('stream2', 0))
                // @ts-expect-error
                connection.addStream(new Stream('stream3', 0))
                expect(connection.streamsAsString()).toEqual([
                    'stream1::0',
                    'stream2::0',
                    'stream3::0',
                ])
            })
        })
    })

    describe('send()', () => {
        let sendFn: Todo

        beforeEach(() => {
            sendFn = jest.fn()
            connection = new Connection({
                send: sendFn,
            }, controlLayerVersion, messageLayerVersion)
        })

        it('sends a serialized message to the socket', () => {
            const msg = {
                serialize: (controlVersion: number, messageVersion: number) => `msg:${controlVersion}:${messageVersion}`,
            }
            connection.send(msg)

            expect(sendFn).toHaveBeenCalledTimes(1)
            expect(sendFn).toHaveBeenCalledWith(msg.serialize(controlLayerVersion, messageLayerVersion))
        })
    })
})
