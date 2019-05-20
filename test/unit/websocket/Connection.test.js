const Connection = require('../../../src/websocket/Connection.js')
const Stream = require('../../../src/websocket/Stream.js')

describe('Connection', () => {
    it('id is assigned', () => {
        const connection = new Connection({}, {
            url: 'url',
        })
        expect(connection.id).toEqual('socketId-1')
    })

    describe('version parsing', () => {
        it('parses versions when present in request url', () => {
            const request = {
                url: 'url?controlLayerVersion=1&messageLayerVersion=30',
            }
            const connection = new Connection({}, request)
            expect(connection.controlLayerVersion).toEqual(1)
            expect(connection.messageLayerVersion).toEqual(30)
        })

        it('uses defaults when versions not present in request url', () => {
            const request = {
                url: 'url',
            }
            const connection = new Connection({}, request)
            expect(connection.controlLayerVersion).toEqual(0)
            expect(connection.messageLayerVersion).toEqual(28)
        })
    })

    describe('stream management', () => {
        let connection

        beforeEach(() => {
            connection = new Connection({}, {
                url: 'url',
            })
        })

        describe('addStream', () => {
            it('adds stream to the connection', () => {
                const stream0 = new Stream('stream', 0)
                const stream2 = new Stream('stream', 1)
                connection.addStream(stream0)
                connection.addStream(stream2)
                expect(connection.getStreams()).toEqual([stream0, stream2])
            })
        })

        describe('removeStream', () => {
            let stream1
            let stream2
            let stream3

            beforeEach(() => {
                stream1 = new Stream('stream1', 0)
                stream2 = new Stream('stream2', 0)
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
                connection.addStream(new Stream('stream1', 0))
                connection.addStream(new Stream('stream2', 0))
                connection.addStream(new Stream('stream3', 0))

                connection.getStreams().push(new Stream('stream4', 0))
                expect(connection.getStreams()).toHaveLength(3)
            })
        })

        describe('streamsAsString', () => {
            it('returns an array of string representation of the streams', () => {
                connection.addStream(new Stream('stream1', 0))
                connection.addStream(new Stream('stream2', 0))
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
        let sendFn
        let connection

        beforeEach(() => {
            sendFn = jest.fn()
            connection = new Connection({
                send: sendFn,
            }, {
                url: 'url',
            })
        })

        it('sends a serialized message to the socket', () => {
            const msg = {
                serialize: (controlVersion, messageVersion) => `msg:${controlVersion}:${messageVersion}`,
            }
            connection.send(msg)

            expect(sendFn).toHaveBeenCalledTimes(1)
            expect(sendFn).toHaveBeenCalledWith('msg:0:28')
        })
    })
})
