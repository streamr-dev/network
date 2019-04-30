const assert = require('assert')
const { ControlLayer, MessageLayer } = require('streamr-client-protocol')
const Connection = require('../../src/websocket/Connection.js')
const Stream = require('../../src/websocket/Stream.js')

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
        const fakeRequest = {
            url: 'url?controlLayerVersion=1&messageLayerVersion=30',
        }
        connection = new Connection(fakeSocket, fakeRequest)
    })

    it('id returns socket id', () => {
        assert.equal(connection.id, 'socketId-1')
    })

    it('parses defined version properly', () => {
        assert.equal(connection.controlLayerVersion, 1)
        assert.equal(connection.messageLayerVersion, 30)
    })

    it('parses undefined version properly', () => {
        const fakeSocket2 = {}
        const conn2 = new Connection(fakeSocket2, {
            url: 'url',
        })
        assert.strictEqual(conn2.controlLayerVersion, 0)
        assert.strictEqual(conn2.messageLayerVersion, 28)
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
            const msg = ControlLayer.UnicastMessage.create('subId', new MessageLayer.StreamMessageV30(
                ['streamId', 0, Date.now(), 0, 'publisherId', '1'], null,
                MessageLayer.StreamMessage.CONTENT_TYPES.JSON, {
                    foo: 'bar',
                }, MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE, null,
            ))
            connection.send(msg)
            assert.deepEqual(fakeSocket.received, [msg.serialize(1, 30)])
        })
        it('sends an old version serialized message to the socket of an old client', () => {
            const msg = ControlLayer.UnicastMessage.create('subId', new MessageLayer.StreamMessageV30(
                ['streamId', 0, Date.now(), 0, 'publisherId', '1'], null,
                MessageLayer.StreamMessage.CONTENT_TYPES.JSON, {
                    foo: 'bar',
                }, MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE, null,
            ))
            const fakeSocket2 = {
                id: 'socketId2',
                received: [],
                send(msg2) {
                    this.received.push(msg2)
                }
            }
            const connection2 = new Connection(fakeSocket2, {
                url: 'url',
            })
            connection2.send(msg)
            assert.deepEqual(fakeSocket2.received, [msg.serialize(0, 28)])
        })
    })
})
