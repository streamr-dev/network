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

    const controlLayerVersion = 1
    const messageLayerVersion = 29

    const myStream = {
        streamId: 'streamId',
    }

    const streamMessage = new Protocol.MessageLayer.StreamMessageV29(
        'streamId',
        0, // partition
        new Date(1491037200000),
        0, // ttl
        2, // offset
        1,
        Protocol.MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
        {
            hello: 'world',
        },
        1,
        'signature',
    )

    beforeEach(() => {
        realtimeAdapter = new events.EventEmitter()
        realtimeAdapter.subscribe = sinon.stub()
        realtimeAdapter.subscribe.callsArgAsync(2)
        realtimeAdapter.unsubscribe = sinon.spy()

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
            authenticate(streamId, authKey, sessionToken) {
                return new Promise(((resolve, reject) => {
                    if (authKey === 'correct' || sessionToken === 'correct') {
                        resolve(myStream)
                    } else if (authKey === 'correctButNoPermission' || sessionToken === 'correctButNoPermission') {
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
        mockSocket = new MockSocket(controlLayerVersion, messageLayerVersion)

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

            const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ControlLayer.ResendResponseResendingV1(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })

        it('adds the subscription id to messages', (done) => {
            historicalAdapter.getAll = sinon.stub()
            historicalAdapter.getAll.callsArgWithAsync(2, streamMessage)

            const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ControlLayer.UnicastMessageV1(
                request.subId,
                streamMessage,
            )

            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })

        it('emits a resent event when resend is complete', (done) => {
            historicalAdapter.getAll = (streamId, streamPartition, messageHandler, onDone) => {
                messageHandler(streamMessage)
                onDone()
            }

            const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ControlLayer.ResendResponseResentV1(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[2], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })

        it('emits no_resend if there is nothing to resend', (done) => {
            historicalAdapter.getAll = sinon.stub()
            historicalAdapter.getAll.callsArgAsync(3)

            const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            const expectedResponse = new Protocol.ControlLayer.ResendResponseNoResendV1(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })

        describe('socket sends resend request with resend_all', () => {
            it('requests all messages from historicalAdapter', (done) => {
                const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
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
                const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
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
                const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
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
                const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
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
                const request = new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
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
            mockSocket.receive(new Protocol.ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'wrong'))
        })

        it('sends only error message to socket', (done) => {
            const expectedResponse = new Protocol.ControlLayer.ErrorResponseV1('Failed to request resend from stream streamId and partition 0: 403')

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages, [expectedResponse.serialize(controlLayerVersion, messageLayerVersion)])
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
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1('streamId', 0, 'correct'))

            setTimeout(() => {
                realtimeAdapter.emit('message', streamMessage)
            })

            const expectedResponse = new Protocol.ControlLayer.BroadcastMessageV1(streamMessage)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
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

            const expectedResponse = new Protocol.ControlLayer.ErrorResponseV1('Stream partition not given!')

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })
    })

    describe('on subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))
        })

        it('creates the Stream object with default partition', (done) => {
            setTimeout(() => {
                assert(server.getStreamObject('streamId', 0) != null)
                done()
            })
        })

        it('creates the Stream object with given partition', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                1,
                'correct',
            ))

            setTimeout(() => {
                assert(server.getStreamObject('streamId', 1) != null)
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
                    new Protocol.ControlLayer.SubscribeResponseV1('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                )
                done()
            })
        })

        it('does not resubscribe to realtimeAdapter on new subscription to same stream', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.ControlLayer.SubscribeRequestV1(
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
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'wrongApiKey',
            ))
        })

        it('does not create the Stream object with default partition', (done) => {
            setTimeout(() => {
                assert(server.getStreamObject('streamId', 0) == null)
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
            const expectedResponse = new Protocol.ControlLayer.ErrorResponseV1('Not authorized to subscribe to stream streamId and partition 0')
            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })
    })

    describe('unsubscribe', () => {
        beforeEach((done) => {
            // connect
            wsMock.emit('connection', mockSocket)

            // subscribe
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe
            setTimeout(() => {
                mockSocket.receive(new Protocol.ControlLayer.UnsubscribeRequestV1('streamId', 0))
                done()
            })
        })

        it('emits a unsubscribed event', () => {
            assert.deepEqual(
                mockSocket.sentMessages[1],
                new Protocol.ControlLayer.UnsubscribeResponseV1('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
            )
        })

        it('unsubscribes from realtimeAdapter if there are no more sockets on the stream', () => {
            sinon.assert.calledWith(realtimeAdapter.unsubscribe, 'streamId', 0)
        })

        it('removes stream object if there are no more sockets on the stream', () => {
            assert(server.getStreamObject('streamId', 0) == null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        beforeEach((done) => {
            realtimeAdapter.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(new Protocol.ControlLayer.UnsubscribeRequestV1('streamId', 0))
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
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(new Protocol.ControlLayer.UnsubscribeRequestV1('streamId', 0))
                done()
            })

            it('does not unsubscribe from realtimeAdapter if there are other subscriptions to it', () => {
                sinon.assert.notCalled(realtimeAdapter.unsubscribe)
            })

            it('does not remove stream object if there are other subscriptions to it', () => {
                assert(server.getStreamObject('streamId', 0) != null)
            })
        })
    })

    describe('subscribe-unsubscribe-subscribe', () => {
        it('should work', (done) => {
            // connect
            wsMock.emit('connection', mockSocket)

            // subscribe
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                // unsubscribe
                mockSocket.receive(new Protocol.ControlLayer.UnsubscribeRequestV1(
                    'streamId',
                    0,
                ))

                setTimeout(() => {
                    // subscribed
                    mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                        'streamId',
                        0,
                        'correct',
                    ))

                    setTimeout(() => {
                        assert.deepEqual(mockSocket.sentMessages, [
                            new Protocol.ControlLayer.SubscribeResponseV1('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                            new Protocol.ControlLayer.UnsubscribeResponseV1('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                            new Protocol.ControlLayer.SubscribeResponseV1('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
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
            const req = new Protocol.ControlLayer.PublishRequestV0(myStream.streamId, 'correct', undefined, '{}')

            publisher.publish = (stream, timestamp, ttl, contentType, content, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, undefined)
                assert.equal(ttl, undefined)
                assert.equal(contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                assert.equal(content, req.content)
                assert.equal(partitionKey, undefined)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads optional fields if specified', (done) => {
            const req = new Protocol.ControlLayer.PublishRequestV0(myStream.streamId, 'correct', undefined, '{}', Date.now(), 'foo')

            publisher.publish = (stream, timestamp, ttl, contentType, content, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, req.timestamp)
                assert.equal(ttl, undefined)
                assert.equal(contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                assert.equal(content, req.content)
                assert.equal(partitionKey, req.partitionKey)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads signature fields if specified', (done) => {
            const req = new Protocol.ControlLayer.PublishRequestV0(
                myStream.streamId, 'correct', undefined, '{}',
                undefined, undefined, 'address', 1, 'signature',
            )

            publisher.publish = (stream, timestamp, ttl, contentType, content, partitionKey, signatureType, publisherAddress, signature) => {
                assert.deepEqual(stream, myStream)
                assert.equal(timestamp, req.timestamp)
                assert.equal(ttl, undefined)
                assert.equal(contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                assert.equal(content, req.content)
                assert.equal(partitionKey, undefined)
                assert.equal(publisherAddress, req.publisherAddress)
                assert.equal(signatureType, req.signatureType)
                assert.equal(signature, req.signature)
                done()
            }
            mockSocket.receive(req)
        })

        describe('error handling', () => {
            let errorMessage

            beforeEach(() => {
                // None of these tests may publish
                publisher.publish = sinon.stub().throws()

                // Expect error messages
                mockSocket.throwOnError = false
            })

            afterEach(() => {
                assert.equal(mockSocket.sentMessages.length, 1)
                const expectedResponse = new Protocol.ControlLayer.ErrorResponseV1(errorMessage)
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
            })

            it('responds with an error if the stream id is missing', () => {
                const req = {
                    type: 'publish',
                    authKey: 'correct',
                    msg: '{}',
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'Publish request failed: Error: Error'
            })

            it('responds with an error if the msg is missing', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correct',
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'No content given!'
            })

            it('responds with an error if the msg is not a string', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correct',
                    msg: {},
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'Publish request failed: Error: Error'
            })

            it('responds with an error if the api key is wrong', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'wrong',
                    msg: '{}',
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'Publish request failed: Error: 403'
            })

            it('responds with an error if the user does not have permission', () => {
                const req = {
                    type: 'publish',
                    stream: 'streamId',
                    authKey: 'correctButNoPermission',
                    msg: '{}',
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'Publish request failed: Error: 401'
            })
        })
    })

    describe('disconnect', () => {
        beforeEach((done) => {
            wsMock.emit('connection', mockSocket)
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                6,
                'correct',
            ))
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
                'streamId',
                4,
                'correct',
            ))
            mockSocket.receive(new Protocol.ControlLayer.SubscribeRequestV1(
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

    describe('createStreamObject', () => {
        it('should return an object with the correct id, partition and state', () => {
            const stream = server.createStreamObject('streamId', 3)
            assert.equal(stream.id, 'streamId')
            assert.equal(stream.partition, 3)
            assert.equal(stream.state, 'init')
        })

        it('should return an object that can be looked up', () => {
            const stream = server.createStreamObject('streamId', 4)
            assert.equal(server.getStreamObject('streamId', 4), stream)
        })
    })

    describe('getStreamObject', () => {
        let stream
        beforeEach(() => {
            stream = server.createStreamObject('streamId', 0)
        })

        it('must return the requested stream', () => {
            assert.equal(server.getStreamObject('streamId', 0), stream)
        })

        it('must return undefined if the stream does not exist', () => {
            assert.equal(server.getStreamObject('streamId', 1), undefined)
        })
    })

    describe('deleteStreamObject', () => {
        beforeEach(() => {
            server.createStreamObject('streamId', 0)
        })

        it('must delete the requested stream', () => {
            server.deleteStreamObject('streamId', 0)
            assert.equal(server.getStreamObject('streamId', 0), undefined)
        })
    })
})
