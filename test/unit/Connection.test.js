const assert = require('assert')
const Protocol = require('streamr-client-protocol')
const Connection = require('../../src/Connection.js')
const Stream = require('../../src/Stream.js')

describe('Connection', () => {
    let connection
    let fakeSocket

    beforeEach(() => {
        fakeSocket = {
            id: 'socketId',
            received: [],
            send(msg) {
                this.received.push(msg)
            },
        }
        connection = new Connection(fakeSocket)
    })

    it('id returns socket id', () => {
        assert.equal(connection.id, 'socketId')
    })

    describe('stream management', () => {
        describe('addStream', () => {
            it('adds stream to the connection', () => {
                const stream0 = new Stream('stream', 0, 'subscribed')
                const stream2 = new Stream('stream', 1, 'subscribing')
                connection.addStream(stream0)
                connection.addStream(stream2)
                assert.deepEqual(connection.getStreams(), [stream0, stream2])
            })
        })

        describe('removeStream', () => {
            let stream1
            let stream2
            let stream3

            beforeEach(() => {
                stream1 = new Stream('stream1', 0, 'subscribed')
                stream2 = new Stream('stream2', 0, 'subscribed')
                stream3 = new Stream('stream3', 0, 'subscribed')
                connection.addStream(stream1)
                connection.addStream(stream2)
                connection.addStream(stream3)
            })

            it('removes stream if it exists', () => {
                connection.removeStream('stream2', 0)
                assert.deepEqual(connection.getStreams(), [stream1, stream3])
            })

            it('keeps streams intact if argument stream does not exist', () => {
                connection.removeStream('stream4', 0)
                assert.deepEqual(connection.getStreams(), [stream1, stream2, stream3])
            })
        })

        describe('getStreams', () => {
            let stream1
            let stream2
            let stream3

            beforeEach(() => {
                stream1 = new Stream('stream1', 0, 'subscribed')
                stream2 = new Stream('stream2', 0, 'subscribed')
                stream3 = new Stream('stream3', 0, 'subscribed')
                connection.addStream(stream1)
                connection.addStream(stream2)
                connection.addStream(stream3)
            })

            it('returns a copy of its streams', () => {
                connection.getStreams().push('foobar')
                assert.deepEqual(connection.getStreams(), [stream1, stream2, stream3])
            })
        })
    })

    describe('send()', () => {
        it('sends a serialized message to the socket', () => {
            const msg = new Protocol.UnicastMessage(new Protocol.StreamMessage(
                'streamId',
                0, // partition
                Date.now(),
                undefined, // ttl
                1, // offset
                0, // previousOffset
                Protocol.StreamMessage.CONTENT_TYPES.JSON,
                {
                    foo: 'bar',
                },
            ), 'subId')
            connection.send(msg)
            assert.deepEqual(fakeSocket.received, [msg.serialize()])
        })
    })
})
