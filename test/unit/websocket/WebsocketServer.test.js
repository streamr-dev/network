const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const intoStream = require('into-stream')
const { ControlLayer, MessageLayer } = require('streamr-client-protocol')
const WebsocketServer = require('../../../src/websocket/WebsocketServer')
const MockSocket = require('../test-helpers/MockSocket')

const CONTROL_LAYER_VERSION = 1
const MESSAGE_LAYER_VERSION = 30

describe('WebsocketServer', () => {
    let server
    let wsMock
    let streamFetcher
    let publisher
    let networkNode
    let mockSocket

    const myStream = {
        id: 'streamId',
        partitions: 0,
    }

    const autoStream = {
        id: 'streamId2',
        partitions: 0,
        autoConfigure: true,
    }

    const fieldsStream = {
        id: 'streamId3',
        partitions: 0,
        autoConfigure: true,
        config: {
            fields: [{
                name: 'name',
                type: 'type',
            }],
        },
    }

    const streams = {
        streamId: myStream,
        streamId2: autoStream,
        streamId3: fieldsStream,
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

    const streamMessage2v30 = new MessageLayer.StreamMessageV30(
        ['streamId2', 0, 1491037200100, 0, 'publisherId', '1'],
        [1491037200000, 0],
        MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
        {
            field1: 'world',
            field2: 12,
            field3: true,
            field4: [],
            field5: {},
        },
        MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH,
        'signature',
    )

    const streamMessage3v30 = new MessageLayer.StreamMessageV30(
        ['streamId3', 0, 1491037200100, 0, 'publisherId', '1'],
        [1491037200000, 0],
        MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
        {
            hello: 'world',
        },
        MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH,
        'signature',
    )

    beforeEach(() => {
        networkNode = new events.EventEmitter()
        networkNode.subscribe = sinon.stub()
        networkNode.subscribe.resolves()
        networkNode.unsubscribe = sinon.spy()
        networkNode.requestResendLast = jest.fn().mockReturnValue(intoStream.object([]))
        networkNode.requestResendFrom = jest.fn().mockReturnValue(intoStream.object([]))
        networkNode.requestResendRange = jest.fn().mockReturnValue(intoStream.object([]))
        networkNode.addMessageListener = (cb) => {
            networkNode.on('message', cb)
        }

        streamFetcher = {
            authenticate(streamId, authKey, sessionToken) {
                return new Promise(((resolve, reject) => {
                    if (authKey === 'correct' || sessionToken === 'correct') {
                        resolve(streams[streamId])
                    } else if (authKey === 'correctButNoPermission' || sessionToken === 'correctButNoPermission') {
                        reject(new Error(401))
                    } else {
                        reject(new Error(403))
                    }
                }))
            },
            setFields: sinon.stub().resolves(''),
        }

        publisher = {
            publish: sinon.stub()
                .resolves(),
        }

        // Mock websocket lib
        wsMock = new events.EventEmitter()
        wsMock.close = () => {}

        // Mock the socket and request
        mockSocket = new MockSocket(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)

        // Create the server instance
        server = new WebsocketServer(wsMock, networkNode, streamFetcher, publisher, undefined, () => 0)
    })

    afterEach(() => {
        mockSocket.disconnect()
        server.close()
    })

    describe('on socket connection', () => {
        let mockSocket2

        beforeEach(() => {
            mockSocket2 = new MockSocket()
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
            wsMock.emit('connection', mockSocket2, mockSocket2.getRequest())
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
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
        })

        it('sends a resending message before starting a resend', (done) => {
            networkNode.requestResendLast.mockReturnValue(intoStream.object([
                ControlLayer.UnicastMessage.create('subId', streamMessagev30)
            ]))
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
            networkNode.requestResendLast.mockReturnValue(intoStream.object([
                ControlLayer.UnicastMessage.create('subId', streamMessagev30)
            ]))
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.UnicastMessage.create(request.subId, streamMessagev30)
            mockSocket.receive(request)
            mockSocket.on('test:send', (numOfMessages) => {
                if (numOfMessages === 2) {
                    assert.deepEqual(mockSocket.sentMessages[1], expectedResponse.serialize())
                    done()
                }
            })
        })

        it('emits a resent event when resend is complete', (done) => {
            networkNode.requestResendLast.mockReturnValue(intoStream.object([
                ControlLayer.UnicastMessage.create('subId', streamMessagev30)
            ]))
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.ResendResponseResent.create(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)
            mockSocket.on('test:send', (numOfSentMessages) => {
                if (numOfSentMessages === 3) {
                    assert.deepEqual(mockSocket.sentMessages[2], expectedResponse.serialize())
                    done()
                }
            })
        })

        it('emits no_resend if there is nothing to resend', (done) => {
            const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')
            const expectedResponse = ControlLayer.ResendResponseNoResend.create(
                request.streamId,
                request.streamPartition,
                request.subId,
            )
            mockSocket.receive(request)
            mockSocket.on('test:send', (numOfMessages) => {
                if (numOfMessages === 1) {
                    assert.deepEqual(mockSocket.sentMessages[0], expectedResponse.serialize())
                    done()
                }
            })
        })

        describe('socket sends ResendRangeRequest', () => {
            it('requests messages from given timestamp range from networkNode (V1)', (done) => {
                const request = ControlLayer.ResendRangeRequest.create(
                    'streamId', 0, 'sub', [1000, 0],
                    [5000, 10], 'publsherId', 'msgChainId', 'correct',
                )

                mockSocket.receive(request)

                setImmediate(() => {
                    expect(networkNode.requestResendRange).toHaveBeenCalledWith(
                        'streamId',
                        0,
                        'sub',
                        1000,
                        0,
                        5000,
                        10,
                        'publsherId',
                        'msgChainId',
                    )
                    done()
                })
            })
        })

        describe('socket sends ResendFromRequest', () => {
            it('requests messages from given message ref from networkNode (V1)', (done) => {
                const request = ControlLayer.ResendFromRequest.create(
                    'streamId', 0, 'sub', [5000, 0], 'publisherId', 'msgChainId', 'correct',
                )

                mockSocket.receive(request)

                setImmediate(() => {
                    expect(networkNode.requestResendFrom).toHaveBeenCalledWith(
                        'streamId',
                        0,
                        'sub',
                        5000,
                        0,
                        'publisherId',
                        'msgChainId',
                    )
                    done()
                })
            })
        })

        describe('socket sends resend request with resend_last', () => {
            it('requests last N messages from networkNode (V1)', (done) => {
                const request = ControlLayer.ResendLastRequest.create('streamId', 0, 'sub', 10, 'correct')

                mockSocket.receive(request)

                setImmediate(() => {
                    expect(networkNode.requestResendLast).toHaveBeenCalledWith(
                        'streamId',
                        0,
                        'sub',
                        10,
                    )
                    done()
                })
            })
        })
    })

    describe('on resend request v0', () => {
        beforeEach(() => {
            // Expect error messages
            mockSocket.throwOnError = false

            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
        })

        it('resend_all is not supported anymore.', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_all: true,
            }, 'correct')
            mockSocket.receive(request)
            const expectedResponse = ControlLayer.ErrorResponse.create('Unknown resend options: {"resend_all":true}')
            setImmediate(() => {
                assert.deepEqual(mockSocket.sentMessages, [
                    expectedResponse.serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
                ])
                expect(networkNode.requestResendLast).not.toHaveBeenCalled()
                expect(networkNode.requestResendFrom).not.toHaveBeenCalled()
                expect(networkNode.requestResendRange).not.toHaveBeenCalled()
                done()
            })
        })

        it('resend_last calls fetchLatest', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_last: 1,
            }, 'correct')
            mockSocket.receive(request)
            setImmediate(() => {
                expect(networkNode.requestResendLast).toHaveBeenCalledWith(
                    request.streamId,
                    request.streamPartition,
                    'sub',
                    1,
                )
                done()
            })
        })

        it('resend_from calls fetchFromTimestamp', (done) => {
            const request = new ControlLayer.ResendRequestV0('streamId', 0, 'sub', {
                resend_from: 132452,
            }, 'correct')
            mockSocket.receive(request)
            setImmediate(() => {
                expect(networkNode.requestResendFrom).toHaveBeenCalledWith(
                    request.streamId,
                    request.streamPartition,
                    'sub',
                    132452,
                    0,
                    null,
                    null
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
            setImmediate(() => {
                expect(networkNode.requestResendRange).toHaveBeenCalledWith(
                    request.streamId,
                    request.streamPartition,
                    'sub',
                    132452,
                    0,
                    654323,
                    0,
                    null,
                    null,
                )
                done()
            })
        })
    })

    describe('message broadcasting', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
        })

        it('emits messages received from Redis to those sockets according to streamId', (done) => {
            mockSocket.receive(ControlLayer.SubscribeRequest.create('streamId', 0, 'correct'))

            setTimeout(() => {
                networkNode.emit('message', streamMessagev30)
            })

            const expected = ControlLayer.BroadcastMessage.create(streamMessagev30)
                .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)

            setTimeout(() => {
                assert.deepEqual(mockSocket.sentMessages[1], expected)
                done()
            })
        })
    })

    describe('on invalid subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())

            // Expect error messages
            mockSocket.throwOnError = false
        })

        it('emits error', (done) => {
            mockSocket.receiveRaw({
                type: 'subscribe',
            })

            const expectedResponse = ControlLayer.ErrorResponse.create(
                'Not authorized to subscribe to stream undefined and partition 0'
            )

            setTimeout(() => {
                assert.deepEqual(
                    mockSocket.sentMessages[0],
                    expectedResponse.serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
                )
                done()
            })
        })
    })

    describe('on subscribe request', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))
        })

        it('creates the Stream object with default partition', (done) => {
            setTimeout(() => {
                assert(server.streams.get('streamId', 0) != null)
                done()
            })
        })

        it('creates the Stream object with given partition', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2, socket2.getRequest())
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                1,
                'correct',
            ))

            setTimeout(() => {
                assert(server.streams.get('streamId', 1) != null)
                socket2.disconnect()
                done()
            })
        })

        it('subscribes to the realtime adapter', (done) => {
            setTimeout(() => {
                sinon.assert.calledWith(networkNode.subscribe, 'streamId', 0)
                done()
            })
        })

        it('emits \'subscribed\' after subscribing', (done) => {
            setTimeout(() => {
                assert.deepEqual(
                    mockSocket.sentMessages[0],
                    ControlLayer.SubscribeResponse.create('streamId', 0)
                        .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
                )
                done()
            })
        })

        it('does not resubscribe to networkNode on new subscription to same stream', (done) => {
            const socket2 = new MockSocket()
            wsMock.emit('connection', socket2, socket2.getRequest())
            socket2.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            setTimeout(() => {
                sinon.assert.calledOnce(networkNode.subscribe)
                socket2.disconnect()
                done()
            })
        })
    })

    describe('on subscribe request with invalid key', () => {
        beforeEach(() => {
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())

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
                assert(server.streams.get('streamId', 0) == null)
                done()
            })
        })

        it('does not subscribe to the networkNode', (done) => {
            setTimeout(() => {
                sinon.assert.notCalled(networkNode.subscribe)
                done()
            })
        })

        it('sends error message to socket', (done) => {
            const expectedResponse = ControlLayer.ErrorResponse.create(
                'Not authorized to subscribe to stream streamId and partition 0'
            )
            setTimeout(() => {
                assert.deepEqual(
                    mockSocket.sentMessages[0],
                    expectedResponse.serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
                )
                done()
            })
        })
    })

    describe('unsubscribe', () => {
        beforeEach((done) => {
            // connect
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())

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
                ControlLayer.UnsubscribeResponse.create('streamId', 0)
                    .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
            )
        })

        it('unsubscribes from networkNode if there are no more sockets on the stream', () => {
            sinon.assert.calledWith(networkNode.unsubscribe, 'streamId', 0)
        })

        it('removes stream object if there are no more sockets on the stream', () => {
            assert(server.streams.get('streamId', 0) == null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        let socket2
        beforeEach((done) => {
            networkNode.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            socket2 = new MockSocket()
            wsMock.emit('connection', socket2, socket2.getRequest())
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

        it('does not unsubscribe from networkNode if there are other subscriptions to it', () => {
            sinon.assert.notCalled(networkNode.unsubscribe)
        })

        it('does not remove stream object if there are other subscriptions to it', () => {
            assert(server.streams.get('streamId', 0) != null)
        })
    })

    describe('subscribe-subscribe-unsubscribe', () => {
        let socket2
        beforeEach((done) => {
            networkNode.unsubscribe = sinon.mock()

            // subscribe
            mockSocket.receive(ControlLayer.SubscribeRequest.create(
                'streamId',
                0,
                'correct',
            ))

            // subscribe 2
            socket2 = new MockSocket()
            wsMock.emit('connection', socket2, socket2.getRequest())
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

        it('does not unsubscribe from networkNode if there are other subscriptions to it', () => {
            sinon.assert.notCalled(networkNode.unsubscribe)
        })

        it('does not remove stream object if there are other subscriptions to it', () => {
            assert(server.streams.get('streamId', 0) != null)
        })

        afterEach(() => {
            socket2.disconnect()
        })
    })

    describe('subscribe-unsubscribe-subscribe', () => {
        it('should work', (done) => {
            // connect
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())

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
                            ControlLayer.SubscribeResponse.create('streamId', 0)
                                .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION),
                            ControlLayer.UnsubscribeResponse.create('streamId', 0)
                                .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION),
                            ControlLayer.SubscribeResponse.create('streamId', 0)
                                .serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION),
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
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
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
                // doesn't try to set fields for a stream with autoConfigure = false
                assert(streamFetcher.setFields.notCalled)
                done()
            }

            mockSocket.receive(req)
        })

        it('sets the fields once for the stream', (done) => {
            const req = ControlLayer.PublishRequest.create(streamMessage2v30, 'correct')
            const req2 = ControlLayer.PublishRequest.create(streamMessage2v30, 'correct')

            publisher.publish = sinon.stub().onSecondCall().callsFake(() => {
                assert(streamFetcher.setFields.calledOnce)
                done()
            })

            streamFetcher.setFields = sinon.stub().callsFake((streamId, fields) => {
                assert.equal(streamId, autoStream.id)
                assert.deepEqual(fields, [{
                    name: 'field1',
                    type: 'string',
                }, {
                    name: 'field2',
                    type: 'number',
                }, {
                    name: 'field3',
                    type: 'boolean',
                }, {
                    name: 'field4',
                    type: 'list',
                }, {
                    name: 'field5',
                    type: 'map',
                }])
                return Promise.resolve()
            })

            mockSocket.receive(req)
            mockSocket.receive(req2)
        })

        it('doesnt set the fields for stream with existing fields', (done) => {
            const req = ControlLayer.PublishRequest.create(streamMessage3v30, 'correct')

            publisher.publish = () => {
                assert(streamFetcher.setFields.notCalled)
                done()
            }

            streamFetcher.setFields = sinon.stub().throws()

            mockSocket.receive(req)
        })

        it('calls the publisher for valid requests (V0)', (done) => {
            const ts = Date.now()
            const req = new ControlLayer.PublishRequestV0(myStream.id, 'correct', undefined, '{}', ts)
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
            const req = new ControlLayer.PublishRequestV0(myStream.id, 'correct', undefined, '{}', ts, 'foo')
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
                myStream.id, 'correct', undefined, '{}',
                ts, undefined, 'address', MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
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
                assert.deepEqual(
                    mockSocket.sentMessages[0],
                    expectedResponse.serialize(CONTROL_LAYER_VERSION, MESSAGE_LAYER_VERSION)
                )
            })

            it('responds with an error if the stream id is missing', () => {
                const req = {
                    type: 'publish',
                    authKey: 'correct',
                    msg: '{}',
                }
                mockSocket.receiveRaw(req)
                errorMessage = 'Publish request failed: Error: streamId must be defined!'
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
            wsMock.emit('connection', mockSocket, mockSocket.getRequest())
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

        it('unsubscribes from networkNode on streams where there are no more connections', () => {
            sinon.assert.calledWith(networkNode.unsubscribe, 'streamId', 6)
            sinon.assert.calledWith(networkNode.unsubscribe, 'streamId', 4)
            sinon.assert.calledWith(networkNode.unsubscribe, 'streamId2', 0)
        })

        it('decrements connection counter', () => {
            assert.equal(server.volumeLogger.connectionCount, 0)
        })
    })
})
