import assert from 'assert'

import EventEmitter from 'eventemitter3'
import sinon from 'sinon'
import debug from 'debug'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'

import Connection from '../../src/Connection'
import Subscription from '../../src/Subscription'
import FailedToPublishError from '../../src/errors/FailedToPublishError'

// eslint-disable-next-line import/no-named-as-default-member
import StubbedStreamrClient from './StubbedStreamrClient'

const {
    BroadcastMessage,
    UnicastMessage,
    SubscribeRequest,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse,
    ResendLastRequest,
    ResendFromRequest,
    ResendRangeRequest,
    ResendResponseResending,
    ResendResponseResent,
    ResendResponseNoResend,
    ErrorResponse,
} = ControlLayer
const { StreamMessage, MessageRef } = MessageLayer
const mockDebug = debug('mock')

describe('StreamrClient', () => {
    let client
    let connection
    let asyncs = []

    function async(func) {
        const me = setTimeout(() => {
            assert.equal(me, asyncs[0])
            asyncs.shift()
            func()
        }, 0)
        asyncs.push(me)
    }

    function clearAsync() {
        asyncs.forEach((it) => {
            clearTimeout(it)
        })
        asyncs = []
    }

    function setupSubscription(
        streamId, emitSubscribed = true, subscribeOptions = {}, handler = sinon.stub(),
        expectSubscribeRequest = !client.getSubscriptions(streamId).length,
    ) {
        assert(client.isConnected(), 'setupSubscription: Client is not connected!')
        if (expectSubscribeRequest) {
            connection.expect(SubscribeRequest.create(streamId, 0, 'session-token'))
        }
        const sub = client.subscribe({
            stream: streamId,
            ...subscribeOptions,
        }, handler)

        if (emitSubscribed) {
            connection.emitMessage(SubscribeResponse.create(sub.streamId))
        }
        return sub
    }

    function msg(streamId = 'stream1', content = {}, requestId) {
        const timestamp = Date.now()
        const streamMessage = StreamMessage.create(
            [streamId, 0, timestamp, 0, '', ''], [timestamp - 100, 0],
            StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, content, StreamMessage.SIGNATURE_TYPES.NONE,
        )
        if (requestId !== undefined) {
            return UnicastMessage.create(requestId, streamMessage)
        }

        return BroadcastMessage.create(streamMessage)
    }

    function createConnectionMock() {
        const c = new EventEmitter()
        c.state = Connection.State.DISCONNECTED

        c.expectedMessagesToSend = []

        c.connect = () => new Promise((resolve) => {
            mockDebug('Connection mock: connecting')
            c.state = Connection.State.CONNECTING
            async(() => {
                mockDebug('Connection mock: connected')
                c.state = Connection.State.CONNECTED
                c.emit('connected')
                resolve()
            })
        })

        c.disconnect = () => new Promise((resolve) => {
            mockDebug('Connection mock: disconnecting')
            c.state = Connection.State.DISCONNECTING
            async(() => {
                mockDebug('Connection mock: disconnected')
                c.state = Connection.State.DISCONNECTED
                c.emit('disconnected')
                resolve()
            })
        })

        c.send = (msgToSend) => {
            const next = c.expectedMessagesToSend.shift()
            next.verificationFunction(msgToSend, next.msgToExpect)
        }

        c.emitMessage = (message) => {
            c.emit(message.type, message)
        }

        c.expect = (msgToExpect, verificationFunction = (msgToSend, expected) => assert.deepEqual(
            msgToSend, expected,
            `Sending unexpected message: ${JSON.stringify(msgToSend)}
                Expected: ${JSON.stringify(expected)}
                Queue: ${JSON.stringify(c.expectedMessagesToSend)}`,
        )) => {
            c.expectedMessagesToSend.push({
                msgToExpect,
                verificationFunction,
            })
        }

        c.checkSentMessages = () => {
            assert.equal(c.expectedMessagesToSend.length, 0, `Expected messages not sent: ${JSON.stringify(c.expectedMessagesToSend)}`)
        }

        return c
    }

    const STORAGE_DELAY = 2000

    beforeEach(() => {
        clearAsync()
        connection = createConnectionMock()
        client = new StubbedStreamrClient({
            autoConnect: false,
            autoDisconnect: false,
            verifySignatures: 'never',
            retryResendAfter: STORAGE_DELAY,
            auth: {
                sessionToken: 'session-token',
            },
        }, connection)
    })

    afterEach((done) => {
        // Allow the event queue to be processed before checking sent messages
        setTimeout(() => {
            try {
                connection.checkSentMessages()
                client.disconnect()
                done()
            } catch (err) {
                done(err)
            }
        })
    })

    describe('Connection event handling', () => {
        describe('connected', () => {
            it('should emit an event on client', (done) => {
                client.on('connected', done)
                client.connect()
            })

            it('should not send anything if not subscribed to anything', (done) => {
                client.connect()
                connection.on('connected', done)
            })

            it('should send pending subscribes', (done) => {
                client.subscribe('stream1', () => {})

                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                client.connect()
                connection.on('connected', done)
            })

            it('should send pending subscribes when disconnected and then reconnected', async () => {
                // On connect
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                // On reconnect
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                client.subscribe('stream1', () => {})
                await client.ensureConnected()
                await connection.disconnect()
                return client.ensureConnected()
            })

            it('should not subscribe to unsubscribed streams on reconnect', (done) => {
                // On connect
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                // On unsubscribe
                connection.expect(UnsubscribeRequest.create('stream1'))

                const sub = client.subscribe('stream1', () => {})
                client.connect().then(() => {
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', async () => {
                        await client.disconnect()
                        await client.connect()
                        done()
                    })
                    client.connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                })
            })
        })

        describe('disconnected', () => {
            beforeEach(() => client.connect())

            it('emits event on client', (done) => {
                client.on('disconnected', done)
                connection.emit('disconnected')
            })

            it('does not remove subscriptions', () => {
                const sub = setupSubscription('stream1')
                connection.emit('disconnected')
                assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
            })

            it('sets subscription state to unsubscribed', () => {
                const sub = setupSubscription('stream1')
                connection.emit('disconnected')
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })
        })

        describe('SubscribeResponse', () => {
            beforeEach(() => client.connect())

            it('marks Subscriptions as subscribed', () => {
                const sub = setupSubscription('stream1')
                assert.equal(sub.getState(), Subscription.State.subscribed)
            })

            it('emits a resend request if resend options were given. No second resend if a message is received.', (done) => {
                const sub = setupSubscription('stream1', false, {
                    resend: {
                        last: 1,
                    },
                })
                sub.once('subscribed', () => {
                    setTimeout(() => connection.emitMessage(msg(sub.streamId, {}, '0')), 200)
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, STORAGE_DELAY + 200)
                })
                connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 1, 'session-token'))
                connection.emitMessage(SubscribeResponse.create(sub.streamId))
            }, STORAGE_DELAY + 1000)

            it('emits multiple resend requests as per multiple subscriptions. No second resends if messages are received.', (done) => {
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                const sub1 = client.subscribe({
                    stream: 'stream1',
                    resend: {
                        last: 2,
                    },
                }, () => {})
                const sub2 = client.subscribe({
                    stream: 'stream1',
                    resend: {
                        last: 1,
                    },
                }, () => {})

                sub1.once('subscribed', () => {
                    setTimeout(() => connection.emitMessage(msg(sub1.streamId, {}, '0')), 200)
                })
                sub2.once('subscribed', () => {
                    setTimeout(() => connection.emitMessage(msg(sub2.streamId, {}, '1')), 200)
                })

                const compFunction = (m1, m2) => {
                    assert.deepStrictEqual(m1.streamId, m2.streamId, 'wrong stream id')
                    assert.deepStrictEqual(m1.streamPartition, m2.streamPartition, 'wrong stream partition')
                    assert.deepStrictEqual(m1.numberLast, m2.numberLast, 'wrong numberLast')
                    assert.deepStrictEqual(m1.sessionToken, m2.sessionToken, 'wrong session token')
                }

                connection.expect(ResendLastRequest.create(sub1.streamId, sub1.streamPartition, '0', 2, 'session-token'), compFunction)
                connection.expect(ResendLastRequest.create(sub2.streamId, sub2.streamPartition, '0', 1, 'session-token'), compFunction)

                connection.emitMessage(SubscribeResponse.create(sub1.streamId))
                setTimeout(() => {
                    sub1.stop()
                    sub2.stop()
                    done()
                }, STORAGE_DELAY + 400)
            }, STORAGE_DELAY + 1000)
        })

        describe('UnsubscribeResponse', () => {
            // Before each test, client is connected, subscribed, and unsubscribe() is called
            let sub
            beforeEach(async () => {
                await client.ensureConnected()
                sub = setupSubscription('stream1')

                sub.on('subscribed', () => {
                    connection.expect(UnsubscribeRequest.create(sub.streamId))
                    client.unsubscribe(sub)
                })
            })

            it('removes the subscription', () => {
                connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                assert.deepEqual(client.getSubscriptions(sub.streamId), [])
            })

            it('sets Subscription state to unsubscribed', () => {
                connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })

            describe('automatic disconnection after last unsubscribe', () => {
                describe('options.autoDisconnect == true', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = true
                    })

                    it('calls connection.disconnect() when no longer subscribed to any streams', () => {
                        const disconnect = jest.spyOn(connection, 'disconnect')
                        connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                        expect(disconnect).toHaveBeenCalled()
                    })
                })

                describe('options.autoDisconnect == false', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = false
                    })

                    it('should not disconnect if autoDisconnect is set to false', () => {
                        const disconnect = jest.spyOn(connection, 'disconnect')
                        connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                        expect(disconnect).not.toHaveBeenCalled()
                    })
                })
            })
        })

        describe('BroadcastMessage', () => {
            let sub

            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1')
            })

            it('should call the message handler of each subscription', () => {
                sub.handleBroadcastMessage = sinon.stub()

                const sub2 = setupSubscription('stream1')
                sub2.handleBroadcastMessage = sinon.stub()

                const msg1 = msg()
                connection.emitMessage(msg1)

                sinon.assert.calledWithMatch(sub.handleBroadcastMessage, msg1.streamMessage, sinon.match.func)
            })

            it('should not crash if messages are received for unknown streams', () => {
                connection.emitMessage(msg('unexpected-stream'))
            })

            it('should ensure that the promise returned by the verification function is cached and returned for all handlers', (done) => {
                let firstResult
                sub.handleBroadcastMessage = (message, verifyFn) => {
                    firstResult = verifyFn()
                    assert(firstResult instanceof Promise, `firstResult is: ${firstResult}`)
                    assert.strictEqual(firstResult, verifyFn())
                }
                const sub2 = setupSubscription('stream1')
                sub2.handleBroadcastMessage = (message, verifyFn) => {
                    const secondResult = verifyFn()
                    assert(secondResult instanceof Promise)
                    assert.strictEqual(firstResult, secondResult)
                    done()
                }
                const msg1 = msg()
                connection.emitMessage(msg1)
            })
        })

        describe('UnicastMessage', () => {
            let sub

            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1', true, {
                    resend: {
                        last: 5,
                    },
                })
                connection.expect(ResendLastRequest.create('stream1', 0, '0', 5, 'session-token'))
            })

            it('should call the message handler of specified Subscription', () => {
                // this sub's handler must be called
                sub.handleResentMessage = sinon.stub()

                // this sub's handler must not be called
                const sub2 = setupSubscription('stream1')
                sub2.handleResentMessage = sinon.stub().throws()

                const msg1 = msg(sub.streamId, {}, '0')
                connection.emitMessage(msg1)
                sinon.assert.calledWithMatch(sub.handleResentMessage, msg1.streamMessage, sinon.match.func)
            })

            it('ignores messages for unknown Subscriptions', () => {
                sub.handleResentMessage = sinon.stub().throws()
                connection.emitMessage(msg(sub.streamId, {}, 'unknown subId'))
            })

            it('should ensure that the promise returned by the verification function is cached', (done) => {
                sub.handleResentMessage = (message, verifyFn) => {
                    const firstResult = verifyFn()
                    assert(firstResult instanceof Promise)
                    assert.strictEqual(firstResult, verifyFn())
                    done()
                }
                const msg1 = msg(sub.streamId, {}, '0')
                connection.emitMessage(msg1)
            })
        })

        describe('ResendResponseResending', () => {
            let sub

            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1', true, {
                    resend: {
                        last: 5,
                    },
                })
                connection.expect(ResendLastRequest.create('stream1', 0, '0', 5, 'session-token'))
            })

            it('emits event on associated subscription', () => {
                sub.handleResending = sinon.stub()
                const resendResponse = ResendResponseResending.create(sub.streamId, sub.streamPartition, '0')
                connection.emitMessage(resendResponse)
                sinon.assert.calledWith(sub.handleResending, resendResponse)
            })
            it('emits error when unknown request id', (done) => {
                sub.handleResending = sinon.stub().throws()
                const resendResponse = ResendResponseResending.create(sub.streamId, sub.streamPartition, 'unknown request id')
                client.on('error', (err) => {
                    assert.deepStrictEqual(err.message, `Received unexpected ResendResponseResendingV1 message ${resendResponse.serialize()}`)
                    done()
                })
                connection.emitMessage(resendResponse)
            })
        })

        describe('ResendResponseNoResend', () => {
            let sub

            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1', true, {
                    resend: {
                        last: 5,
                    },
                })
                connection.expect(ResendLastRequest.create('stream1', 0, '0', 5, 'session-token'))
            })

            it('calls event handler on subscription', () => {
                sub.handleNoResend = sinon.stub()
                const resendResponse = ResendResponseNoResend.create(sub.streamId, sub.streamPartition, '0')
                connection.emitMessage(resendResponse)
                sinon.assert.calledWith(sub.handleNoResend, resendResponse)
            })
            it('ignores messages for unknown subscriptions', (done) => {
                sub.handleNoResend = sinon.stub().throws()
                const resendResponse = ResendResponseNoResend.create(sub.streamId, sub.streamPartition, 'unknown request id')
                client.on('error', (err) => {
                    assert.deepStrictEqual(err.message, `Received unexpected ResendResponseNoResendV1 message ${resendResponse.serialize()}`)
                    done()
                })
                connection.emitMessage(resendResponse)
            })
        })

        describe('ResendResponseResent', () => {
            let sub

            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1', true, {
                    resend: {
                        last: 5,
                    },
                })
                connection.expect(ResendLastRequest.create('stream1', 0, '0', 5, 'session-token'))
            })

            it('calls event handler on subscription', () => {
                sub.handleResent = sinon.stub()
                const resendResponse = ResendResponseResent.create(sub.streamId, sub.streamPartition, '0')
                connection.emitMessage(resendResponse)
                sinon.assert.calledWith(sub.handleResent, resendResponse)
            })
            it('does not call event handler for unknown subscriptions', (done) => {
                sub.handleResent = sinon.stub().throws()
                const resendResponse = ResendResponseResent.create(sub.streamId, sub.streamPartition, 'unknown request id')
                client.on('error', (err) => {
                    assert.deepStrictEqual(err.message, `Received unexpected ResendResponseResentV1 message ${resendResponse.serialize()}`)
                    done()
                })
                connection.emitMessage(resendResponse)
            })
        })

        describe('ErrorResponse', () => {
            beforeEach(() => client.connect())

            it('emits an error event on client', (done) => {
                setupSubscription('stream1')
                const errorResponse = ErrorResponse.create('Test error')

                client.on('error', (err) => {
                    assert.equal(err.message, errorResponse.errorMessage)
                    done()
                })
                connection.emitMessage(errorResponse)
            })
        })

        describe('error', () => {
            beforeEach(() => client.connect())

            it('reports InvalidJsonErrors to subscriptions', (done) => {
                const sub = setupSubscription('stream1')
                const jsonError = new Errors.InvalidJsonError(sub.streamId, 'invalid json', new Error('Invalid JSON: invalid json'), msg('stream1').streamMessage)

                sub.handleError = (err) => {
                    assert.equal(err, jsonError)
                    done()
                }
                connection.emit('error', jsonError)
            })

            it('emits other errors as error events on client', (done) => {
                setupSubscription('stream1')
                const testError = new Error('This is a test error message, ignore')

                client.on('error', (err) => {
                    assert.equal(err, testError)
                    done()
                })
                connection.emit('error', testError)
            })
        })
    })

    describe('connect()', () => {
        it('should return a promise which resolves when connected', () => {
            const result = client.connect()
            assert(result instanceof Promise)
            return result
        })

        it('should call connection.connect()', () => {
            connection.connect = sinon.stub().resolves()
            client.connect()
            assert(connection.connect.calledOnce)
        })

        it('should reject promise while connecting', (done) => {
            connection.state = Connection.State.CONNECTING
            client.connect().catch(() => done())
        })

        it('should reject promise when connected', (done) => {
            connection.state = Connection.State.CONNECTED
            client.connect().catch(() => done())
        })
    })

    describe('subscribe()', () => {
        it('should call client.connect() if autoConnect is set to true', (done) => {
            client.options.autoConnect = true
            client.on('connected', done)

            connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
            client.subscribe('stream1', () => {})
        })

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('throws an error if no options are given', () => {
                assert.throws(() => {
                    client.subscribe(undefined, () => {})
                })
            })

            it('throws an error if options is wrong type', () => {
                assert.throws(() => {
                    client.subscribe(['streamId'], () => {})
                })
            })

            it('throws an error if no callback is given', () => {
                assert.throws(() => {
                    client.subscribe('stream1')
                })
            })

            it('sends a subscribe request', () => {
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                client.subscribe({
                    stream: 'stream1',
                }, () => {})
            })

            it('sends a subscribe request for a given partition', () => {
                connection.expect(SubscribeRequest.create('stream1', 5, 'session-token'))

                client.subscribe({
                    stream: 'stream1',
                    partition: 5,
                }, () => {})
            })

            it('sends subscribe request for each subscribed partition', async () => {
                connection.expect(SubscribeRequest.create('stream1', 2, 'session-token'))
                connection.expect(SubscribeRequest.create('stream1', 3, 'session-token'))
                connection.expect(SubscribeRequest.create('stream1', 4, 'session-token'))

                client.subscribe({
                    stream: 'stream1',
                    partition: 2,
                }, () => {})

                client.subscribe({
                    stream: 'stream1',
                    partition: 3,
                }, () => {})

                client.subscribe({
                    stream: 'stream1',
                    partition: 4,
                }, () => {})
            })

            it('accepts stream id as first argument instead of object', () => {
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                client.subscribe('stream1', () => {})
            })

            it('sends only one subscribe request to server even if there are multiple subscriptions for same stream', () => {
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                client.subscribe('stream1', () => {})
                client.subscribe('stream1', () => {})
            })

            it('sets subscribed state on subsequent subscriptions without further subscribe requests', (done) => {
                connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                const sub = client.subscribe('stream1', () => {})
                connection.emitMessage(SubscribeResponse.create(sub.streamId))

                const sub2 = client.subscribe(sub.streamId, () => {})
                sub2.on('subscribed', () => {
                    assert.equal(sub2.getState(), Subscription.State.subscribed)
                    done()
                })
            })

            describe('with resend options', () => {
                it('supports resend.from', (done) => {
                    const ref = new MessageRef(5, 0)
                    const sub = setupSubscription('stream1', false, {
                        resend: {
                            from: {
                                timestamp: ref.timestamp,
                                sequenceNumber: ref.sequenceNumber,
                            },
                            publisherId: 'publisherId',
                            msgChainId: '1',
                        },
                    })
                    sub.once('subscribed', () => {
                        setTimeout(() => connection.emitMessage(msg(sub.streamId, {}, '0')), 200)
                        setTimeout(() => {
                            sub.stop()
                            done()
                        }, STORAGE_DELAY + 200)
                    })
                    connection.expect(ResendFromRequest.create(
                        sub.streamId, sub.streamPartition, '0', ref.toArray(),
                        'publisherId', '1', 'session-token',
                    ))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                }, STORAGE_DELAY + 1000)

                it('supports resend.last', (done) => {
                    const sub = setupSubscription('stream1', false, {
                        resend: {
                            last: 5,
                        },
                    })
                    sub.once('subscribed', () => {
                        setTimeout(() => connection.emitMessage(msg(sub.streamId, {}, '0')), 200)
                        setTimeout(() => {
                            sub.stop()
                            done()
                        }, STORAGE_DELAY + 200)
                    })
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 5, 'session-token'))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                }, STORAGE_DELAY + 1000)

                it('sends 2 ResendLastRequests if no StreamMessage received after some delay', (done) => {
                    const sub = setupSubscription('stream1', false, {
                        resend: {
                            last: 5,
                        },
                    })
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 5, 'session-token'))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '1', 5, 'session-token'))
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, STORAGE_DELAY + 200)
                }, STORAGE_DELAY + 1000)

                it('sends a second ResendLastRequest if no StreamMessage received and a ResendResponseNoResend received', (done) => {
                    const sub = setupSubscription('stream1', false, {
                        resend: {
                            last: 5,
                        },
                    })
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 5, 'session-token'))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                    connection.emitMessage(ResendResponseNoResend.create(sub.streamId, sub.streamPartition, '0'))
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '1', 5, 'session-token'))
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, STORAGE_DELAY + 200)
                }, STORAGE_DELAY + 1000)

                it('throws if multiple resend options are given', () => {
                    assert.throws(() => {
                        client.subscribe({
                            stream: 'stream1',
                            resend: {
                                from: {
                                    timestamp: 1,
                                    sequenceNumber: 0,
                                },
                                last: 5,
                            },
                        }, () => {})
                    })
                })
            })

            describe('Subscription event handling', () => {
                describe('gap', () => {
                    it('sends resend request', () => {
                        const sub = setupSubscription('stream1')
                        const fromRef = new MessageRef(1, 0)
                        const toRef = new MessageRef(5, 0)
                        connection.expect(ResendRangeRequest.create(
                            sub.streamId, sub.streamPartition, '0',
                            fromRef.toArray(), toRef.toArray(), 'publisherId', 'msgChainId', 'session-token',
                        ))
                        const fromRefObject = {
                            timestamp: fromRef.timestamp,
                            sequenceNumber: fromRef.sequenceNumber,
                        }
                        const toRefObject = {
                            timestamp: toRef.timestamp,
                            sequenceNumber: toRef.sequenceNumber,
                        }
                        sub.emit('gap', fromRefObject, toRefObject, 'publisherId', 'msgChainId')
                    })

                    it('does not send another resend request while resend is in progress', () => {
                        const sub = setupSubscription('stream1')
                        const fromRef = new MessageRef(1, 0)
                        const toRef = new MessageRef(5, 0)
                        connection.expect(ResendRangeRequest.create(
                            sub.streamId, sub.streamPartition, '0',
                            fromRef.toArray(), toRef.toArray(), 'publisherId', 'msgChainId', 'session-token',
                        ))
                        const fromRefObject = {
                            timestamp: fromRef.timestamp,
                            sequenceNumber: fromRef.sequenceNumber,
                        }
                        const toRefObject = {
                            timestamp: toRef.timestamp,
                            sequenceNumber: toRef.sequenceNumber,
                        }
                        sub.emit('gap', fromRefObject, toRefObject, 'publisherId', 'msgChainId')
                        sub.emit('gap', fromRefObject, {
                            timestamp: 10,
                            sequenceNumber: 0,
                        }, 'publisherId', 'msgChainId')
                    })
                })

                describe('done', () => {
                    it('unsubscribes', (done) => {
                        const sub = setupSubscription('stream1')

                        client.unsubscribe = (unsub) => {
                            assert.equal(sub, unsub)
                            done()
                        }
                        sub.emit('done')
                    })
                })
            })
        })
    })

    describe('unsubscribe()', () => {
        // Before each, client is connected and subscribed
        let sub
        beforeEach(async () => {
            await client.connect()
            sub = setupSubscription('stream1', true, {}, sinon.stub().throws())
        })

        it('sends an unsubscribe request', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))
            client.unsubscribe(sub)
        })

        it('does not send unsubscribe request if there are other subs remaining for the stream', () => {
            client.subscribe({
                stream: sub.streamId,
            }, () => {})

            client.unsubscribe(sub)
        })

        it('sends unsubscribe request when the last subscription is unsubscribed', (done) => {
            const sub2 = client.subscribe({
                stream: sub.streamId,
            }, () => {})

            sub2.once('subscribed', () => {
                client.unsubscribe(sub)

                connection.expect(UnsubscribeRequest.create(sub.streamId))
                client.unsubscribe(sub2)
                done()
            })
        })

        it('does not send an unsubscribe request again if unsubscribe is called multiple times', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))

            client.unsubscribe(sub)
            client.unsubscribe(sub)
        })

        it('does not send another unsubscribed event if the same Subscription is already unsubscribed', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))
            const handler = sinon.stub()

            sub.on('unsubscribed', handler)
            client.unsubscribe(sub)
            connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
            assert.equal(sub.getState(), Subscription.State.unsubscribed)

            client.unsubscribe(sub)
            assert.equal(handler.callCount, 1)
        })

        it('throws if no Subscription is given', () => {
            assert.throws(() => {
                client.unsubscribe()
            })
        })

        it('throws if Subscription is of wrong type', () => {
            assert.throws(() => {
                client.unsubscribe(sub.streamId)
            })
        })
    })

    describe('publish', () => {
        const pubMsg = {
            foo: 'bar',
        }
        const hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
        function getPublishRequest(streamId, timestamp, sequenceNumber, prevMsgRef) {
            const streamMessage = StreamMessage.create(
                [streamId, 0, timestamp, sequenceNumber, hashedUsername, client.msgCreationUtil.msgChainId], prevMsgRef,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, pubMsg, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            return ControlLayer.PublishRequest.create(streamMessage, 'session-token')
        }

        it('queues messages and sends them once connected', (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            const ts = Date.now()
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                connection.expect(getPublishRequest('streamId', ts, i, prevMsgRef))
                client.publish('streamId', pubMsg, ts)
                prevMsgRef = [ts, i]
            }
            connection.on('connected', () => {
                setTimeout(done, 2000)
            })
        })

        it('accepts timestamp as date instead of number', (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            const date = new Date()
            connection.expect(getPublishRequest('streamId', date.getTime(), 0, null))
            client.publish('streamId', pubMsg, date)
            connection.on('connected', () => {
                setTimeout(done, 1000)
            })
        })

        it('accepts timestamp as date string instead of number', (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            connection.expect(getPublishRequest('streamId', 123, 0, null))
            client.publish('streamId', pubMsg, '1970-01-01T00:00:00.123Z')
            connection.on('connected', () => {
                setTimeout(done, 1000)
            })
        })

        it('rejects the promise if autoConnect is false and the client is not connected', (done) => {
            client.options.auth.username = 'username'
            client.options.autoConnect = false
            client.publish('stream1', pubMsg).catch((err) => {
                assert(err instanceof FailedToPublishError)
                done()
            })
        })

        it('subsequent calls to "publish()" should not call "getStream()" (must be cached)', async () => {
            client.options.auth.username = 'username'
            await client.connect()

            const ts = Date.now()
            connection.expect(getPublishRequest('streamId', ts, 0, null))
            await client.publish('streamId', pubMsg, ts)
            assert(client.getStream.called)

            connection.expect(getPublishRequest('streamId', ts, 1, [ts, 0]))
            await client.publish('streamId', pubMsg, ts)
            assert(client.getStream.calledOnce)
        })
    })

    describe('disconnect()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = done
            client.disconnect()
        })

        it('resets subscriptions', async () => {
            const sub = setupSubscription('stream1')
            await client.disconnect()
            assert.deepEqual(client.getSubscriptions(sub.streamId), [])
        })
    })

    describe('pause()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = done
            client.pause()
        })

        it('does not reset subscriptions', async () => {
            const sub = setupSubscription('stream1')
            await client.pause()
            assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
        })
    })

    describe('Fields set', () => {
        it('sets auth.apiKey from authKey', () => {
            const c = new StubbedStreamrClient({
                authKey: 'authKey',
            }, createConnectionMock())
            assert(c.options.auth.apiKey)
        })
        it('sets auth.apiKey from apiKey', () => {
            const c = new StubbedStreamrClient({
                apiKey: 'apiKey',
            }, createConnectionMock())
            assert(c.options.auth.apiKey)
        })
        it('sets private key with 0x prefix', () => {
            const c = new StubbedStreamrClient({
                auth: {
                    privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                },
            }, createConnectionMock())
            assert(c.options.auth.privateKey.startsWith('0x'))
        })
        it('sets unauthenticated', () => {
            const c = new StubbedStreamrClient({}, createConnectionMock())
            assert(c.session.options.unauthenticated)
        })
    })

    describe('StreamrClient.generateEthereumAccount()', () => {
        it('generates a new Ethereum account', () => {
            const result = StubbedStreamrClient.generateEthereumAccount()
            const wallet = new Wallet(result.privateKey)
            assert.equal(result.address, wallet.address)
        })
    })
})

