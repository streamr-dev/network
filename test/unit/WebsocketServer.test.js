const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const Protocol = require('streamr-client-protocol')

const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const WebsocketServer = require('../../src/WebsocketServer')

const MockSocket = require('./test-helpers/MockSocket')

describe('WebsocketServer', () => {
    let server
    let wsMock
    let streamFetcher
    let publisher
    let realtimeAdapter
    let historicalAdapter
    let latestOffsetFetcher
    let mockSocket

    const myStream = {
        streamId: 'streamId',
    }

    const streamMessage = new Protocol.StreamMessage(
        'streamId',
        0, // partition
        new Date(1491037200000),
        0, // ttl
        2, // offset
        1,
        Protocol.StreamMessage.CONTENT_TYPES.JSON,
        {
            hello: 'world',
        },
    )

    beforeEach(() => {
        realtimeAdapter = new events.EventEmitter()
        realtimeAdapter.subscribe = sinon.stub()
        realtimeAdapter.subscribe.resolves()
        realtimeAdapter.unsubscribe = sinon.spy()
        realtimeAdapter.addMessageListener = (cb) => {
            realtimeAdapter.on('message', cb)
        }

        historicalAdapter = {
            getLast: sinon.spy(),
            getAll: sinon.spy(),
            getFromOffset: sinon.spy(),
            getOffsetRange: sinon.spy(),
            getFromTimestamp: sinon.spy(),
            getTimestampRange: sinon.spy(),
        }

        latestOffsetFetcher = {
            fetchOffset: sinon.stub()
                .resolves(0),
        }

        streamFetcher = {
            authenticate(streamId, authKey) {
                return new Promise(((resolve, reject) => {
                    if (authKey === 'correct') {
                        resolve(myStream)
                    } else if (authKey === 'correctButNoPermission') {
                        reject(new Error(401))
                    } else {
                        reject(new Error(403))
                    }
                }))
            },
        }

        publisher = {
            publish: sinon.stub()
                .resolves(),
        }

        // Mock websocket lib
        wsMock = new events.EventEmitter()

        // Mock the socket
        mockSocket = new MockSocket()

        // Create the server instance
        server = new WebsocketServer(wsMock, realtimeAdapter, historicalAdapter, latestOffsetFetcher, streamFetcher, publisher)
    })

    describe('on socket connection', () => {
        let mockSocket2

        beforeEach(() => {
            mockSocket2 = new MockSocket()
            wsMock.emit('connection', mockSocket)
            wsMock.emit('connection', mockSocket2)
        })

        it('listens to connected sockets "message" event', () => {
            assert.equal(mockSocket.listenerCount('message'), 1)
            assert.equal(mockSocket2.listenerCount('message'), 1)
        })

        it('listens to connected sockets "close" event', () => {
            assert.equal(mockSocket.listenerCount('close'), 1)
            assert.equal(mockSocket2.listenerCount('close'), 1)
        })

        it('increments connection counter', () => {
            assert.equal(server.volumeLogger.connectionCount, 2)
        })
    })

    describe('on resend request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
        })

        it('sends a resending message before starting a resend', (done) => {
            historicalAdapter.getAll = sinon.stub()
            historicalAdapter.getAll.callsArgWithAsync(2, streamMessage)

            const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ResendResponseResending(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize())
                done()
            })
        })

        it('adds the subscription id to messages', (done) => {
            historicalAdapter.getAll = sinon.stub()
            historicalAdapter.getAll.callsArgWithAsync(2, streamMessage)

            const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.UnicastMessage(
                streamMessage,
                request.subId,
            )

            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], expectedResponse.serialize())
                done()
            })
        })

        it('emits a resent event when resend is complete', (done) => {
            historicalAdapter.getAll = (streamId, streamPartition, messageHandler, onDone) => {
                messageHandler(streamMessage)
                onDone()
            }

            const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ResendResponseResent(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[2], expectedResponse.serialize())
                done()
            })
        })

        it('emits no_resend if there is nothing to resend', (done) => {
            historicalAdapter.getAll = sinon.stub()
            historicalAdapter.getAll.callsArgAsync(3)

            const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ResendResponseNoResend(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize())
                done()
            })
        })

        describe('socket sends resend request with resend_all', () => {
            it('requests all messages from historicalAdapter', (done) => {
                const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                    resend_all: true,
                }, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(historicalAdapter.getAll, request.streamId, request.streamPartition)
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_from', () => {
            it('requests messages from given offset from historicalAdapter', (done) => {
                const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                    resend_from: 333,
                }, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.getFromOffset, request.streamId, request.streamPartition,
                        request.resendOptions.resend_from,
                    )
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_from AND resend_to', () => {
            it('requests messages from given range from historicalAdapter', (done) => {
                const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                    resend_from: 7,
                    resend_to: 10,
                }, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.getOffsetRange, request.streamId, request.streamPartition,
                        request.resendOptions.resend_from, request.resendOptions.resend_to,
                    )
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_from_time', () => {
            it('requests messages from given timestamp from historicalAdapter', (done) => {
                const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                    resend_from_time: Date.now(),
                }, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.getFromTimestamp, request.streamId, request.streamPartition,
                        request.resendOptions.resend_from_time,
                    )
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_last', () => {
            it('requests last N messages from historicalAdapter', (done) => {
                const request = new Protocol.ResendRequest('streamId', 0, 'sub', {
                    resend_last: 10,
                }, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(historicalAdapter.getLast, request.streamId, request.streamPartition, request.resendOptions.resend_last)
                    done()
                })
            })
        })
    })

    describe('on resend request with invalid key', () => {
        beforeEach(() => {
            // Expect error messages
            mockSocket.throwOnError = false

            wsMock.emit('connection', mockSocket)
            mockSocket.receive(new Protocol.ResendRequest('streamId', 0, 'sub', {
                resend_all: true,
            }, 'wrong'))
        })

        it('sends only error message to socket', (done) => {
            const expectedResponse = new Protocol.ErrorResponse('Failed to request resend from stream streamId and partition 0: 403')

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages, [expectedResponse.serialize()])
                done()
            })
        })

        it('historicalAdapter is not called', (done) => {
            setTimeout(() => {
                sinon.assert.notCalled(historicalAdapter.getAll)
                done()
            })
        })
    })

    describe('message broadcasting', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
        })

        it('emits messages received from Redis to those sockets according to streamId', (done) => {
            mockSocket.receive(new Protocol.SubscribeRequest('streamId', 0, 'correct'))

            setTimeout(() => {
                realtimeAdapter.emit('message', streamMessage, 'streamId', 0)
            })

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], new Protocol.BroadcastMessage(streamMessage).serialize())
                done()
            })
        })
    })

    describe('on invalid subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)

            // Expect error messages
            mockSocket.throwOnError = false
        })

        it('emits error', (done) => {
            mockSocket.receiveRaw({
                type: 'subscribe',
            })

            setTimeout(() => {
                const msg = Protocol.WebsocketResponse.deserialize(mockSocket.sentMessages[0])
                assert(msg instanceof Protocol.ErrorResponse)
                done()
            })
        })
    })

    describe('on subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                undefined,
                'correct',
            ))
        })

        it('creates the Stream object with default partition', (done) => {
            setTimeout(() => {
                assert(server.streams.getStreamObject('streamId', 0) != null)
                done()
            })
        })

        it('creates the Stream object with given partition', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.SubscribeRequest(
                'streamId',
                1,
                'correct',
            ))

            setTimeout(() => {
                assert(server.streams.getStreamObject('streamId', 1) != null)
                done()
            })
        })

        it('subscribes to the realtime adapter', (done) => {
            setTimeout(() => {
                sinon.assert.calledWith(realtimeAdapter.subscribe, 'streamId', 0)
                done()
            })
        })

        it('emits \'subscribed\' after subscribing', (done) => {
            setTimeout(() => {
                assert.deepEqual(
                    mockSocket.sentMessages[0],
                    new Protocol.SubscribeResponse('streamId', 0).serialize(),
                )
                done()
            })
        })

        it('does not resubscribe to realtimeAdapter on new subscription to same stream', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                sinon.assert.calledOnce(realtimeAdapter.subscribe)
                done()
            })
        })
    })

    describe('on subscribe request with invalid key', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)

            // Expect error messages
            mockSocket.throwOnError = false
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'wrongApiKey',
            ))
        })

        it('does not create the Stream object with default partition', (done) => {
            setTimeout(() => {
                assert(server.streams.getStreamObject('streamId', 0) == null)
                done()
            })
        })

        it('does not subscribe to the realtime adapter', (done) => {
            setTimeout(() => {
                sinon.assert.notCalled(realtimeAdapter.subscribe)
                done()
            })
        })

        it('sends error message to socket', (done) => {
            setTimeout(() => {
                assert(Protocol.WebsocketResponse.deserialize(mockSocket.sentMessages[0]) instanceof Protocol.ErrorResponse)
                done()
            })
        })
    })

    describe('unsubscribe', () => {
        beforeEach((done) => {
            // connect
            wsMock.emit('connection', mockSocket)

            // subscribe
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe
            setTimeout(() => {
                mockSocket.receive(new Protocol.UnsubscribeRequest('streamId', 0))
                done()
            })
        })

        it('emits a unsubscribed event', () => {
            assert.deepEqual(
                mockSocket.sentMessages[1],
                new Protocol.UnsubscribeResponse('streamId', 0).serialize(),
            )
        })

        it('unsubscribes from realtimeAdapter if there are no more sockets on the stream', () => {
            sinon.assert.calledWith(realtimeAdapter.unsubscribe, 'streamId', 0)
        })

        it('removes stream object if there are no more sockets on the stream', () => {
            assert(server.streams.getStreamObject('streamId', 0) == null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        beforeEach((done) => {
            realtimeAdapter.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(new Protocol.UnsubscribeRequest('streamId', 0))
                done()
            })
        })

        it('does not unsubscribe from realtimeAdapter if there are other subscriptions to it', () => {
            sinon.assert.notCalled(realtimeAdapter.unsubscribe)
        })

        it('does not remove stream object if there are other subscriptions to it', () => {
            assert(server.getStreamObject('streamId', 0) != null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        beforeEach((done) => {
            realtimeAdapter.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(new Protocol.UnsubscribeRequest('streamId', 0))
                done()
            })

            it('does not unsubscribe from realtimeAdapter if there are other subscriptions to it', () => {
                sinon.assert.notCalled(realtimeAdapter.unsubscribe)
            })

            it('does not remove stream object if there are other subscriptions to it', () => {
                assert(server.streams.getStreamObject('streamId', 0) != null)
            })
        })
    })

    describe('subscribe-unsubscribe-subscribe', () => {
        it('should work', (done) => {
            // connect
            wsMock.emit('connection', mockSocket)

            // subscribe
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                // unsubscribe
                mockSocket.receive(new Protocol.UnsubscribeRequest(
                    'streamId',
                    0,
                ))

                setTimeout(() => {
                    // subscribed
                    mockSocket.receive(new Protocol.SubscribeRequest(
                        'streamId',
                        0,
                        'correct',
                    ))

                    setTimeout(() => {
                        assert.deepEqual(mockSocket.sentMessages, [
                            new Protocol.SubscribeResponse('streamId', 0).serialize(),
                            new Protocol.UnsubscribeResponse('streamId', 0).serialize(),
                            new Protocol.SubscribeResponse('streamId', 0).serialize(),
                        ])
                        done()
                    })
                })
            })
        })
    })

    describe('publish', () => {
        beforeEach(() => {
            // We are in connected state
            wsMock.emit('connection', mockSocket)
        })

        it('calls the publisher for valid requests', (done) => {
            const req = new Protocol.PublishRequest(myStream.streamId, 'correct', undefined, '{}')

            publisher.publish = (stream, timestamp, content, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, undefined)
                assert.equal(content, req.content)
                assert.equal(partitionKey, undefined)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads optional fields if specified', (done) => {
            const req = new Protocol.PublishRequest(myStream.streamId, 'correct', undefined, '{}', Date.now(), 'foo')

            publisher.publish = (stream, timestamp, content, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, req.timestamp)
                assert.equal(content, req.content)
                assert.equal(partitionKey, req.partitionKey)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads signature fields if specified', (done) => {
            const req = new Protocol.PublishRequest(myStream.streamId, 'correct', undefined, '{}', undefined, undefined, 'address', 1, 'signature')

            publisher.publish = (stream, timestamp, content, partitionKey, signatureType, publisherAddress, signature) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, req.timestamp)
                assert.equal(content, req.content)
                assert.equal(partitionKey, undefined)
                assert.equal(publisherAddress, req.publisherAddress)
                assert.equal(signatureType, req.signatureType)
                assert.equal(signature, req.signature)
                done()
            }
            const mockSocket3 = new MockSocket(29)
            wsMock.emit('connection', mockSocket3)
            mockSocket3.receive(req)
        })

        describe('error handling', () => {
            beforeEach(() => {
                // None of these tests may publish
                publisher.publish = sinon.stub().throws()

                // Expect error messages
                mockSocket.throwOnError = false
            })

            afterEach(() => {
                assert.equal(mockSocket.sentMessages.length, 1)
                assert(Protocol.WebsocketResponse.deserialize(mockSocket.sentMessages[0]) instanceof Protocol.ErrorResponse)
            })

            it('responds with an error if the stream id is missing', () => {
                const req = {
                    type: 'publish',
                    authKey: 'correct',
                    msg: '{}',
                }

                mockSocket.receiveRaw(req)
            })

            it('responds with an error if the msg is missing', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correct',
                }

                mockSocket.receiveRaw(req)
            })

            it('responds with an error if the msg is not a string', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correct',
                    msg: {},
                }

                mockSocket.receiveRaw(req)
            })

            it('responds with an error if the api key is wrong', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'wrong',
                    msg: '{}',
                }

                mockSocket.receiveRaw(req)
            })

            it('responds with an error if the user does not have permission', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correctButNoPermission',
                    msg: '{}',
                }

                mockSocket.receiveRaw(req)
            })
        })
    })

    describe('disconnect', () => {
        beforeEach((done) => {
            wsMock.emit('connection', mockSocket)
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                6,
                'correct',
            ))
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId',
                4,
                'correct',
            ))
            mockSocket.receive(new Protocol.SubscribeRequest(
                'streamId2',
                0,
                'correct',
            ))

            setTimeout(() => {
                mockSocket.disconnect()
                done()
            })
        })

        it('unsubscribes from realtimeAdapter on streams where there are no more connections', () => {
            sinon.assert.calledWith(realtimeAdapter.unsubscribe, 'streamId', 6)
            sinon.assert.calledWith(realtimeAdapter.unsubscribe, 'streamId', 4)
            sinon.assert.calledWith(realtimeAdapter.unsubscribe, 'streamId2', 0)
        })

        it('decrements connection counter', () => {
            assert.equal(server.volumeLogger.connectionCount, 0)
        })
    })
})
