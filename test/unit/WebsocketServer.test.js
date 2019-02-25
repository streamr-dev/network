const { Readable } = require('stream')
const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const { ControlLayer, MessageLayer } = require('streamr-client-protocol')
const WebsocketServer = require('../../src/WebsocketServer')
const MockSocket = require('./test-helpers/MockSocket')

describe('WebsocketServer', () => {
    let server
    let wsMock
    let streamFetcher
    let publisher
    let realtimeAdapter
    let historicalAdapter
    let mockSocket

    const controlLayerVersion = 1
    const messageLayerVersion = 30

    const myStream = {
        streamId: 'streamId',
    }

    const streamMessagev29 = new MessageLayer.StreamMessageV29(
        'streamId',
        0, // partition
        1491037200000,
        0, // ttl
        2, // offset
        1,
        MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
        {
            hello: 'world',
        },
        MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH,
        'publisherId',
        'signature',
    )

    const streamMessagev30 = new MessageLayer.StreamMessageV30(
        ['streamId', 0, 1491037200100, 0, 'publisherId', '1'],
        [1491037200000, 0],
        MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
        {
            hello: 'world',
        },
        MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH,
        'signature',
    )

    beforeEach(() => {
        realtimeAdapter = new events.EventEmitter()
        realtimeAdapter.subscribe = sinon.stub()
        realtimeAdapter.subscribe.callsArgAsync(2)
        realtimeAdapter.unsubscribe = sinon.spy()

        historicalAdapter = {
            fetchLatest: sinon.stub().returns((() => {
                const readableStream = new Readable({
                    objectMode: true,
                    read() {},
                })
                readableStream.push(streamMessagev30)
                readableStream.push(null)
                return readableStream
            })()),
            fetchFromTimestamp: sinon.stub().returns({
                on: sinon.stub(),
            }),
            fetchFromMessageRefForPublisher: sinon.stub().returns({
                on: sinon.stub(),
            }),
            fetchBetweenTimestamps: sinon.stub().returns({
                on: sinon.stub(),
            }),
            fetchBetweenMessageRefsForPublisher: sinon.stub().returns({
                on: sinon.stub(),
            }),
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
        server = new WebsocketServer(wsMock, realtimeAdapter, historicalAdapter, streamFetcher, publisher)
    })

    afterEach(() => {
        mockSocket.disconnect()
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
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.ResendResponseResending.create(
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
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.UnicastMessage.create(request.subId, streamMessagev30)
            mockSocket.receive(request)
            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], expectedResponse.serialize())
                done()
            })
        })

        it('emits a resent event when resend is complete', (done) => {
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.ResendResponseResent.create(
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
            historicalAdapter.fetchLatest = sinon.stub().returns((() => {
                const readableStream = new Readable({
                    objectMode: true,
                    read() {},
                })
                readableStream.push(null)
                return readableStream
            })())

            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.ResendResponseNoResend.create(
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

        describe('socket sends ResendRangeRequest', () => {
            it('requests messages from given timestamp range from historicalAdapter (V1)', (done) => {
                const request = ControlLayer.ResendRangeRequest.create(
                    'streamId', 0, 'sub', [Date.now().toString(), null],
                    [Date.now().toString(), null], null, null, 'correct',
                )

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.fetchBetweenTimestamps, request.streamId, request.streamPartition,
                        request.fromMsgRef.timestamp, request.toMsgRef.timestamp,
                    )
                    done()
                })
            })
            it('requests messages from given message refs range from historicalAdapter (V1)', (done) => {
                const request = ControlLayer.ResendRangeRequest.create(
                    'streamId', 0, 'sub', [Date.now().toString(), 0],
                    [Date.now().toString(), 0], 'publisherId', 'msgChainId', 'correct',
                )

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.fetchBetweenMessageRefsForPublisher, request.streamId, request.streamPartition,
                        request.fromMsgRef, request.toMsgRef, request.publisherId, request.msgChainId,
                    )
                    done()
                })
            })
        })

        describe('socket sends ResendFromRequest', () => {
            it('requests messages from given timestamp from historicalAdapter (V1)', (done) => {
                const request = ControlLayer.ResendFromRequest.create(
                    'streamId', 0, 'sub',
                    [Date.now().toString(), null], null, null, 'correct',
                )

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.fetchFromTimestamp, request.streamId, request.streamPartition,
                        request.fromMsgRef.timestamp,
                    )
                    done()
                })
            })
            it('requests messages from given message ref from historicalAdapter (V1)', (done) => {
                const request = ControlLayer.ResendFromRequest.create(
                    'streamId', 0, 'sub',
                    [Date.now().toString(), 0], 'publisherId', 'msgChainId', 'correct',
                )

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(
                        historicalAdapter.fetchFromMessageRefForPublisher, request.streamId, request.streamPartition,
                        request.fromMsgRef, request.publisherId, request.msgChainId,
                    )
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_last', () => {
            it('requests last N messages from historicalAdapter (V1)', (done) => {
                const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')

                mockSocket.receive(request)

                setTimeout(() => {
                    sinon.assert.calledWith(historicalAdapter.fetchLatest, request.streamId, request.streamPartition, request.numberLast)
                    done()
                })
            })
        })
    })

    describe('on resend request v0', () => {
        beforeEach(() => {
            // Expect error messages
            mockSocket.throwOnError = false

            wsMock.emit('connection', mockSocket)
        })

        it('resend_all is not supported anymore.', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            mockSocket.receive(request)
            const expectedResponse = ControlLayer.ErrorResponse.create('Unknown resend options: {"resend_all":true}')
            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages, [expectedResponse.serialize(controlLayerVersion, messageLayerVersion)])
                sinon.assert.notCalled(historicalAdapter.fetchLatest)
                sinon.assert.notCalled(historicalAdapter.fetchFromTimestamp)
                sinon.assert.notCalled(historicalAdapter.fetchFromMessageRefForPublisher)
                sinon.assert.notCalled(historicalAdapter.fetchBetweenTimestamps)
                sinon.assert.notCalled(historicalAdapter.fetchBetweenMessageRefsForPublisher)
                done()
            })
        })

        it('resend_last calls fetchLatest', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_last: 1,
            }, 'correct')
            mockSocket.receive(request)
            setTimeout(() => {
                sinon.assert.calledWith(historicalAdapter.fetchLatest, request.streamId, request.streamPartition, request.resendOptions.resend_last)
                done()
            })
        })

        it('resend_from calls fetchFromTimestamp', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_from: 132452,
            }, 'correct')
            mockSocket.receive(request)
            setTimeout(() => {
                sinon.assert.calledWith(
                    historicalAdapter.fetchFromTimestamp, request.streamId,
                    request.streamPartition, request.resendOptions.resend_from,
                )
                done()
            })
        })

        it('resend_from+resend_to calls fetchBetweenTimestamps', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_from: 132452,
                resend_to: 654323,
            }, 'correct')
            mockSocket.receive(request)
            setTimeout(() => {
                sinon.assert.calledWith(
                    historicalAdapter.fetchBetweenTimestamps, request.streamId,
                    request.streamPartition, request.resendOptions.resend_from, request.resendOptions.resend_to,
                )
                done()
            })
        })
    })

    describe('message broadcasting', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
        })

        it('emits messages received from Redis to those sockets according to streamId', (done) => {
            mockSocket.receive(ControlLayer.SubscribeRequest.create('streamId', 0, 'correct'))

            setTimeout(() => {
                realtimeAdapter.emit('message', streamMessagev30)
            })

            const expectedResponse = ControlLayer.BroadcastMessage.create(streamMessagev30)

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

            const expectedResponse = ControlLayer.ErrorResponse.create('Not authorized to subscribe to stream undefined and partition 0')

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize(controlLayerVersion, messageLayerVersion))
                done()
            })
        })
    })

    describe('on subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
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
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                1,
                'correct',
            ))

            setTimeout(() => {
                assert(server.getStreamObject('streamId', 1) != null)
                socket2.disconnect()
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
                    ControlLayer.SubscribeResponse.create('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                )
                done()
            })
        })

        it('does not resubscribe to realtimeAdapter on new subscription to same stream', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                sinon.assert.calledOnce(realtimeAdapter.subscribe)
                socket2.disconnect()
                done()
            })
        })
    })

    describe('on subscribe request with invalid key', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket)

            // Expect error messages
            mockSocket.throwOnError = false
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
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
            const expectedResponse = ControlLayer.ErrorResponse.create('Not authorized to subscribe to stream streamId and partition 0')
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
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe
            setTimeout(() => {
                mockSocket.receive(ControlLayer.UnsubscribeRequest.create('streamId', 0))
                done()
            })
        })

        it('emits a unsubscribed event', () => {
            assert.deepEqual(
                mockSocket.sentMessages[1],
                ControlLayer.UnsubscribeResponse.create('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
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
        let socket2
        beforeEach((done) => {
            realtimeAdapter.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(ControlLayer.UnsubscribeRequest.create('streamId', 0))
                done()
            })
        })

        afterEach(() => {
            socket2.disconnect()
        })

        it('does not unsubscribe from realtimeAdapter if there are other subscriptions to it', () => {
            sinon.assert.notCalled(realtimeAdapter.unsubscribe)
        })

        it('does not remove stream object if there are other subscriptions to it', () => {
            assert(server.getStreamObject('streamId', 0) != null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        let socket2
        beforeEach((done) => {
            realtimeAdapter.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            socket2 = new MockSocket()
            wsMock.emit('connection', socket2)
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // unsubscribe 1
            setTimeout(() => {
                mockSocket.receive(ControlLayer.UnsubscribeRequest.create('streamId', 0))
                done()
            })
        })

        it('does not unsubscribe from realtimeAdapter if there are other subscriptions to it', () => {
            sinon.assert.notCalled(realtimeAdapter.unsubscribe)
        })

        it('does not remove stream object if there are other subscriptions to it', () => {
            assert(server.getStreamObject('streamId', 0) != null)
        })

        afterEach(() => {
            socket2.disconnect()
        })
    })

    describe('subscribe-unsubscribe-subscribe', () => {
        it('should work', (done) => {
            // connect
            wsMock.emit('connection', mockSocket)

            // subscribe
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                // unsubscribe
                mockSocket.receive(ControlLayer.UnsubscribeRequest.create(
                    'streamId',
                    0,
                ))

                setTimeout(() => {
                    // subscribed
                    mockSocket.receive(ControlLayer.SubscribeRequest.create(
                        'streamId',
                        0,
                        'correct',
                    ))

                    setTimeout(() => {
                        assert.deepEqual(mockSocket.sentMessages, [
                            ControlLayer.SubscribeResponse.create('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                            ControlLayer.UnsubscribeResponse.create('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
                            ControlLayer.SubscribeResponse.create('streamId', 0).serialize(controlLayerVersion, messageLayerVersion),
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

        it('calls the publisher for valid requests (V1&V29)', (done) => {
            const req = ControlLayer.PublishRequest.create(streamMessagev29, 'correct')

            publisher.publish = (stream, streamMessage) => {
                assert.deepEqual(stream, myStream)
                assert.equal(streamMessage.getStreamPartition(), req.streamMessage.getStreamPartition())
                assert.equal(streamMessage.getTimestamp(), req.streamMessage.getTimestamp())
                assert.equal(streamMessage.getPublisherId(), req.streamMessage.getPublisherId())
                assert.equal(streamMessage.contentType, MessageLayer.StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(streamMessage.getContent(), req.streamMessage.getContent())
                assert.equal(streamMessage.signatureType, req.streamMessage.signatureType)
                assert.equal(streamMessage.signature, req.streamMessage.signature)
                done()
            }

            mockSocket.receive(req)
        })

        it('calls the publisher for valid requests (V1&V30)', (done) => {
            const req = ControlLayer.PublishRequest.create(streamMessagev30, 'correct')

            publisher.publish = (stream, streamMessage) => {
                assert.deepEqual(stream, myStream)
                assert.equal(streamMessage.getStreamPartition(), req.streamMessage.getStreamPartition())
                assert.equal(streamMessage.getTimestamp(), req.streamMessage.getTimestamp())
                assert.equal(streamMessage.messageId.sequenceNumber, req.streamMessage.messageId.sequenceNumber)
                assert.equal(streamMessage.getPublisherId(), req.streamMessage.getPublisherId())
                assert.equal(streamMessage.prevMsgRef.timestamp, req.streamMessage.prevMsgRef.timestamp)
                assert.equal(streamMessage.prevMsgRef.sequenceNumber, req.streamMessage.prevMsgRef.sequenceNumber)
                assert.equal(streamMessage.contentType, MessageLayer.StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(streamMessage.getContent(), req.streamMessage.getContent())
                assert.equal(streamMessage.signatureType, req.streamMessage.signatureType)
                assert.equal(streamMessage.signature, req.streamMessage.signature)
                done()
            }

            mockSocket.receive(req)
        })

        it('calls the publisher for valid requests (V0)', (done) => {
            const ts = Date.now()
            const req = new ControlLayer.PublishRequestV0(myStream.streamId, 'correct', undefined, '{}', ts)
            publisher.getStreamPartition = (stream, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(partitionKey, undefined)
                return 0
            }
            publisher.publish = (stream, streamMessage) => {
                assert.deepEqual(stream, myStream)
                assert.equal(streamMessage.getStreamPartition(), 0)
                assert.equal(streamMessage.getTimestamp(), ts)
                assert.equal(streamMessage.contentType, MessageLayer.StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(streamMessage.getContent(), req.content)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads optional fields if specified (V0)', (done) => {
            const ts = Date.now()
            const req = new ControlLayer.PublishRequestV0(myStream.streamId, 'correct', undefined, '{}', ts, 'foo')
            publisher.getStreamPartition = (stream, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(partitionKey, 'foo')
                return 0
            }
            publisher.publish = (stream, streamMessage) => {
                assert.deepEqual(stream, myStream)
                assert.equal(streamMessage.getStreamPartition(), 0)
                assert.equal(streamMessage.getTimestamp(), ts)
                assert.equal(streamMessage.contentType, MessageLayer.StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(streamMessage.getContent(), req.content)
                done()
            }

            mockSocket.receive(req)
        })

        it('reads signature fields if specified (V0)', (done) => {
            const ts = Date.now()
            const req = new ControlLayer.PublishRequestV0(
                myStream.streamId, 'correct', undefined, '{}',
                ts, undefined, 'address', MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            publisher.getStreamPartition = (stream, partitionKey) => {
                assert.deepEqual(stream, myStream)
                assert.equal(partitionKey, undefined)
                return 0
            }
            publisher.publish = (stream, streamMessage) => {
                assert.deepEqual(stream, myStream)
                assert.equal(streamMessage.getStreamPartition(), 0)
                assert.equal(streamMessage.getTimestamp(), ts)
                assert.equal(streamMessage.messageId.sequenceNumber, 0)
                assert.equal(streamMessage.getPublisherId(), 'address')
                assert.equal(streamMessage.prevMsgRef, null)
                assert.equal(streamMessage.contentType, MessageLayer.StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(streamMessage.getContent(), '{}')
                assert.equal(streamMessage.signatureType, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
                assert.equal(streamMessage.signature, 'signature')
                done()
            }
            mockSocket.receive(req)
        })

        describe('error handling', () => {
            let errorMessage

            beforeEach(() => {
                // None of these tests may publish
                publisher.getStreamPartition = sinon.stub().returns(0)
                publisher.publish = sinon.stub().throws()

                // Expect error messages
                mockSocket.throwOnError = false
            })

            afterEach(() => {
                assert.equal(mockSocket.sentMessages.length, 1)
                const expectedResponse = ControlLayer.ErrorResponse.create(errorMessage)
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
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                6,
                'correct',
            ))
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                4,
                'correct',
            ))
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
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
            server.deleteStreamObject('streamId', 3)
        })

        it('should return an object that can be looked up', () => {
            const stream = server.createStreamObject('streamId', 4)
            assert.equal(server.getStreamObject('streamId', 4), stream)
            server.deleteStreamObject('streamId', 4)
        })
    })

    describe('getStreamObject', () => {
        let stream
        beforeEach(() => {
            stream = server.createStreamObject('streamId', 0)
        })
        afterEach(() => {
            server.deleteStreamObject('streamId', 0)
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
