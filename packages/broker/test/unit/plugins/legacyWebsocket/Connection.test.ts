import { Connection } from '../../../../src/plugins/legacyWebsocket/Connection'
import { Stream } from '../../../../src/Stream'
import { EventEmitter } from "events"
import WebSocket from "ws"

class FakeWebSocket extends EventEmitter {
    send: () => void
    constructor() {
        super()
        this.send = jest.fn()
    }

}

describe('Connection', () => {
    let controlLayerVersion: number
    let messageLayerVersion: number
    let fakeSocket: FakeWebSocket
    let connection: Connection

    beforeEach(() => {
        controlLayerVersion = 2
        messageLayerVersion = 31
        fakeSocket = new FakeWebSocket()
        connection = new Connection(fakeSocket as unknown as WebSocket, controlLayerVersion, messageLayerVersion)
    })

    it('id is assigned', () => {
        expect(connection.id).toEqual('socketId-1')
    })

    describe('stream management', () => {
        describe('addStream', () => {
            it('adds stream to the connection', () => {
                const stream0 = new Stream('stream', 0, '')
                const stream2 = new Stream('stream', 1, '')
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
    })

    describe('send()', () => {
        it('sends a serialized message to the socket', () => {
            // @ts-expect-error violate private
            const fakeDuplexStream = connection.duplexStream = {
                write: jest.fn()
            }
            const msg: any = {
                serialize: (controlVersion: number, messageVersion: number) => `msg:${controlVersion}:${messageVersion}`,
            }
            connection.send(msg)

            expect(fakeDuplexStream.write).toHaveBeenCalledTimes(1)
            expect(fakeDuplexStream.write).toHaveBeenCalledWith(msg.serialize(controlLayerVersion, messageLayerVersion))
        })
    })
})
