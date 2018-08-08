const assert = require('assert')
const Connection = require('../../src/Connection.js')
const Stream = require('../../src/Stream.js')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')

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

    describe('send functions', () => {
        const timestamp = 1490355900000
        let msgWithMetaDataAsArray

        beforeEach(() => {
            const streamrBinaryMessage = new StreamrBinaryMessage(
                'streamId', 0, new Date(timestamp), 0,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from('{}', 'utf8'),
            )
            const msgWithMetaData = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, 25, 24, 0)
            msgWithMetaDataAsArray = msgWithMetaData.toArray()
        })

        function expectedMessage(msgCode) {
            return JSON.stringify([0, msgCode, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, '{}']])
        }

        it('sendBroadcast sends expected message to socket', () => {
            connection.sendBroadcast(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(0)])
        })

        it('sendUnicast sends expected message to socket', () => {
            connection.sendUnicast(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(1)])
        })

        it('sendSubscribed sends expected message to socket', () => {
            connection.sendSubscribed(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(2)])
        })

        it('sendUnsubscribed sends expected message to socket', () => {
            connection.sendUnsubscribed(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(3)])
        })

        it('sendResending sends expected message to socket', () => {
            connection.sendResending(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(4)])
        })

        it('sendResent sends expected message to socket', () => {
            connection.sendResent(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(5)])
        })

        it('sendNoResend sends expected message to socket', () => {
            connection.sendNoResend(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(6)])
        })

        it('sendError sends expected message to socket', () => {
            connection.sendError(msgWithMetaDataAsArray)
            assert.deepEqual(fakeSocket.received, [expectedMessage(7)])
        })
    })
})
