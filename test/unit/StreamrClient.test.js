import crypto from 'crypto'

import EventEmitter from 'eventemitter3'
import sinon from 'sinon'
import debug from 'debug'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import FailedToPublishError from '../../src/errors/FailedToPublishError'
import Connection from '../../src/Connection'
import Subscription from '../../src/Subscription'
import KeyExchangeUtil from '../../src/KeyExchangeUtil'
// import StreamrClient from '../../src/StreamrClient'
import { uid } from '../utils'

// eslint-disable-next-line import/no-named-as-default-member
import StubbedStreamrClient from './StubbedStreamrClient'

const {
    ControlMessage,
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

const { StreamMessage, MessageRef, MessageID, MessageIDStrict } = MessageLayer
const { getKeyExchangeStreamId } = KeyExchangeUtil
const mockDebug = debug('mock')

describe('StreamrClient', () => {
    let client
    let connection
    let asyncs = []
    let requests = []

    const streamPartition = 0
    const sessionToken = 'session-token'

    function async(func) {
        const me = setTimeout(() => {
            expect(me).toEqual(asyncs[0])
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
        expect(client.isConnected()).toBeTruthy()
        const requestId = uid('request')

        if (expectSubscribeRequest) {
            connection.expect(new SubscribeRequest({
                requestId,
                streamId,
                streamPartition,
                sessionToken,
            }))
        }
        const sub = client.subscribe({
            stream: streamId,
            ...subscribeOptions,
        }, handler)

        if (emitSubscribed) {
            connection.emitMessage(new SubscribeResponse({
                streamId: sub.streamId,
                requestId,
                streamPartition,
            }))
        }
        return sub
    }

    function getStreamMessage(streamId = 'stream1', content = {}, publisherId = '') {
        const timestamp = Date.now()
        return new StreamMessage({
            messageId: new MessageIDStrict(streamId, 0, timestamp, 0, publisherId, ''),
            prevMesssageRef: new MessageRef(timestamp - 100, 0),
            content,
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
            signature: '',
        })
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

        c.clearReconnectTimeout = () => {}

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

        c.send = jest.fn(async (request) => {
            requests.push(request)
        })

        c.emitMessage = (message) => {
            c.emit(message.type, message)
        }

        return c
    }

    let errors = []

    function onError(error) {
        errors.push(error)
    }

    function mockSubscription(...opts) {
        let sub
        connection.send = jest.fn(async (request) => {
            requests.push(request)
            await wait()
            if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                connection.emitMessage(new SubscribeResponse({
                    streamId: sub.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }

            if (request.type === ControlMessage.TYPES.UnsubscribeRequest) {
                connection.emitMessage(new UnsubscribeResponse({
                    streamId: sub.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }
        })
        sub = client.subscribe(...opts).on('error', onError)
        return sub
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
        errors = []
        requests = []
        client.on('error', onError)
    })

    afterEach(async () => {
        client.removeListener('error', onError)
        await client.ensureDisconnected()
        expect(errors[0]).toBeFalsy()
        expect(errors).toHaveLength(0)
    })

    afterAll(async () => {
        await wait(3000) // give tests a few more moments to clean up
    })

    describe('connecting behaviour', () => {
        it('connected event should emit an event on client', (done) => {
            client.once('connected', () => {
                done()
            })
            client.connect()
        })

        it('should not send anything if not subscribed to anything', async () => {
            await client.ensureConnected()
            expect(connection.send).not.toHaveBeenCalled()
        })

        it('should send pending subscribes', async () => {
            client.subscribe('stream1', () => {}).on('error', onError)

            await client.ensureConnected()
            await wait()
            expect(connection.send.mock.calls).toHaveLength(1)
            expect(connection.send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })

        it('should send pending subscribes when disconnected and then reconnected', async () => {
            client.subscribe('stream1', () => {}).on('error', onError)
            await client.ensureConnected()
            await connection.disconnect()
            await client.ensureConnected()
            await wait()
            expect(connection.send.mock.calls).toHaveLength(2)
            // On connect
            expect(connection.send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })

            // On reconnect
            expect(connection.send.mock.calls[1][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })
        // TODO convert and move all super mocked tests to integration
    })

    describe('disconnection behaviour', () => {
        beforeEach(async () => client.ensureConnected())

        it('emits disconnected event on client', async (done) => {
            client.once('disconnected', done)
            await connection.disconnect()
        })

        it('does not remove subscriptions', async () => {
            const sub = client.subscribe('stream1', () => {}).on('error', onError)
            await connection.disconnect()
            expect(client.getSubscriptions(sub.streamId)).toEqual([sub])
        })

        it('sets subscription state to unsubscribed', async () => {
            const sub = client.subscribe('stream1', () => {}).on('error', onError)
            await connection.disconnect()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })
    })

    describe('SubscribeResponse', () => {
        beforeEach(async () => client.ensureConnected())

        it('marks Subscriptions as subscribed', async (done) => {
            const sub = mockSubscription('stream1', () => {})
            sub.once('subscribed', () => {
                expect(sub.getState()).toEqual(Subscription.State.subscribed)
                done()
            })
        })

        it('generates a requestId without resend', (done) => {
            const sub = mockSubscription({
                stream: 'stream1',
            }, () => {})
            sub.once('subscribed', () => {
                const { requestId } = requests[0]
                expect(requestId).toBeTruthy()
                done()
            })
        })

        it('emits a resend request if resend options were given. No second resend if a message is received.', (done) => {
            const sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 1,
                },
            }, () => {})
            sub.once('subscribed', async () => {
                await wait(100)
                const { requestId } = requests[requests.length - 1]
                const streamMessage = getStreamMessage(sub.streamId, {})
                connection.emitMessage(new UnicastMessage({
                    requestId,
                    streamMessage,
                }))
                await wait(STORAGE_DELAY)
                sub.stop()
                await wait()
                expect(connection.send.mock.calls).toHaveLength(2) // sub + resend
                expect(connection.send.mock.calls[1][0]).toMatchObject({
                    type: ControlMessage.TYPES.ResendLastRequest,
                    streamId: sub.streamId,
                    streamPartition: sub.streamPartition,
                    requestId,
                    numberLast: 1,
                    sessionToken: 'session-token'
                })
                done()
            })
        }, STORAGE_DELAY + 1000)

        it('emits multiple resend requests as per multiple subscriptions. No second resends if messages are received.', async (done) => {
            const sub1 = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 2,
                },
            }, () => {})
            const sub2 = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 1,
                },
            }, () => {})

            let requestId1
            let requestId2

            await Promise.all([
                new Promise((resolve) => {
                    sub1.once('subscribed', async () => {
                        await wait(200)
                        requestId1 = requests[requests.length - 2].requestId
                        const streamMessage = getStreamMessage(sub1.streamId, {})
                        connection.emitMessage(new UnicastMessage({
                            requestId: requestId1,
                            streamMessage,
                        }))
                        resolve()
                    })
                }),
                new Promise((resolve) => {
                    sub2.once('subscribed', async () => {
                        await wait(200)
                        requestId2 = requests[requests.length - 1].requestId
                        const streamMessage = getStreamMessage(sub2.streamId, {})
                        connection.emitMessage(new UnicastMessage({
                            requestId: requestId2,
                            streamMessage,
                        }))
                        resolve()
                    })
                })
            ])

            await wait(STORAGE_DELAY + 400)
            sub1.stop()
            sub2.stop()

            const expectedResponses = [
                new ResendLastRequest({
                    streamId: sub1.streamId,
                    streamPartition: sub1.streamPartition,
                    requestId: requestId1,
                    numberLast: 2,
                    sessionToken: 'session-token',
                }),
                new ResendLastRequest({
                    streamId: sub2.streamId,
                    streamPartition: sub2.streamPartition,
                    requestId: requestId2,
                    numberLast: 1,
                    sessionToken: 'session-token',
                })
            ]
            // eslint-disable-next-line semi-style
            ;[connection.send.mock.calls[1][0], connection.send.mock.calls[2][0]].forEach((actual, index) => {
                const expected = expectedResponses[index]
                expect(actual).toMatchObject({
                    requestId: expected.requestId,
                    streamId: expected.streamId,
                    streamPartition: expected.streamPartition,
                    numberLast: expected.numberLast,
                    sessionToken: expected.sessionToken,
                })
            })
            done()
        }, STORAGE_DELAY + 1000)
    })

    describe('UnsubscribeResponse', () => {
        // Before each test, client is connected, subscribed, and unsubscribe() is called
        let sub
        beforeEach(async (done) => {
            await client.ensureConnected()
            sub = mockSubscription('stream1', () => {})
            sub.once('subscribed', () => done())
        })

        it('removes the subscription', async () => {
            client.unsubscribe(sub)
            await wait()
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })

        it('sets Subscription state to unsubscribed', async () => {
            client.unsubscribe(sub)
            await wait()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })

        describe('automatic disconnection after last unsubscribe', () => {
            describe('options.autoDisconnect == true', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = true
                })

                it('calls connection.disconnect() when no longer subscribed to any streams', async () => {
                    const disconnect = jest.spyOn(connection, 'disconnect')
                    client.unsubscribe(sub)
                    await wait(100)
                    expect(disconnect).toHaveBeenCalled()
                })
            })

            describe('options.autoDisconnect == false', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = false
                })

                it('should not disconnect if autoDisconnect is set to false', async () => {
                    const disconnect = jest.spyOn(connection, 'disconnect')
                    client.unsubscribe(sub)
                    await wait(100)
                    expect(disconnect).not.toHaveBeenCalled()
                })
            })
        })
    })

    describe('BroadcastMessage', () => {
        let sub

        beforeEach(async () => {
            await client.connect()
            sub = mockSubscription('stream1', () => {})
        })

        it('should call the message handler of each subscription', () => {
            sub.handleBroadcastMessage = jest.fn()

            const sub2 = setupSubscription('stream1')
            sub2.handleBroadcastMessage = jest.fn()
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)

            expect(sub.handleBroadcastMessage).toHaveBeenCalledWith(msg1.streamMessage, expect.any(Function))
        })

        it('should not crash if messages are received for unknown streams', () => {
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage('unexpected-stream', {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })

        it('should ensure that the promise returned by the verification function is cached and returned for all handlers', (done) => {
            let firstResult
            sub.handleBroadcastMessage = (message, verifyFn) => {
                firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(verifyFn()).toBe(firstResult)
            }
            const sub2 = mockSubscription('stream1', () => {})
            sub2.handleBroadcastMessage = (message, verifyFn) => {
                firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(verifyFn()).toBe(firstResult)
                const secondResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(secondResult).toBe(firstResult)
                done()
            }

            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage('stream1', {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })
    })

    describe('UnicastMessage', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
                .once('subscribed', () => done())
        })

        it('should call the message handler of specified Subscription', async () => {
            // this sub's handler must be called
            sub.handleResentMessage = jest.fn()
            const { requestId } = requests[requests.length - 1]
            expect(requestId).toBeTruthy()

            // this sub's handler must not be called
            const sub2 = mockSubscription('stream1', () => {})
            sub2.handleResentMessage = jest.fn()
            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)
            await wait()
            expect(sub.handleResentMessage).toHaveBeenCalledWith(msg1.streamMessage, requestId, expect.any(Function))
            expect(sub2.handleResentMessage).not.toHaveBeenCalled()
        })

        it('ignores messages for unknown Subscriptions', (done) => {
            client.onError = jest.fn()
            sub.handleResentMessage = jest.fn()

            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId: 'unknown requestId',
            })
            client.once('error', (err) => {
                errors.pop() // remove this error
                expect(err.message).toEqual(`Received unexpected UnicastMessage message ${msg1.serialize()}`)
                expect(sub.handleResentMessage).not.toHaveBeenCalled()
                expect(client.onError).toHaveBeenCalled()
                done()
            })

            connection.emitMessage(msg1)
        })

        it('should ensure that the promise returned by the verification function is cached', (done) => {
            const { requestId } = requests[requests.length - 1]
            sub.handleResentMessage = (message, msgRequestId, verifyFn) => {
                expect(msgRequestId).toEqual(requestId)
                const firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(firstResult).toBe(verifyFn())
                done()
            }

            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })
    })

    describe('ResendResponseResending', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
                .once('subscribed', () => done())
        })

        it('emits event on associated subscription', async () => {
            sub.handleResending = jest.fn()
            const { requestId } = requests[requests.length - 1]
            const resendResponse = new ResendResponseResending({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await wait()
            expect(sub.handleResending).toHaveBeenCalledWith(resendResponse)
        })

        it('emits error when unknown request id', (done) => {
            client.onError = jest.fn()
            sub.handleResending = jest.fn()
            const resendResponse = new ResendResponseResending({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id',
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseResending message ${resendResponse.serialize()}`)
                expect(client.onError).toHaveBeenCalled()
                expect(sub.handleResending).not.toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ResendResponseNoResend', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {}).once('subscribed', () => done())
        })

        it('calls event handler on subscription', () => {
            sub.handleNoResend = jest.fn()
            const { requestId } = requests[requests.length - 1]
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            expect(sub.handleNoResend).toHaveBeenCalledWith(resendResponse)
        })

        it('ignores messages for unknown subscriptions', (done) => {
            client.onError = jest.fn()
            sub.handleNoResend = jest.fn()
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id'
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseNoResend message ${resendResponse.serialize()}`)
                expect(sub.handleNoResend).not.toHaveBeenCalled()
                expect(client.onError).toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ResendResponseResent', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {}).once('subscribed', () => done())
        })

        it('calls event handler on subscription', () => {
            sub.handleResent = jest.fn()
            const { requestId } = requests[requests.length - 1]
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            expect(sub.handleResent).toHaveBeenCalledWith(resendResponse)
        })

        it('does not call event handler for unknown subscriptions', (done) => {
            client.onError = jest.fn()
            sub.handleResent = jest.fn()
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id',
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseResent message ${resendResponse.serialize()}`)
                expect(sub.handleResent).not.toHaveBeenCalled()
                expect(client.onError).toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ErrorResponse', () => {
        beforeEach(async (done) => {
            await client.connect()
            mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                }
            }, () => {}).once('subscribed', () => done())
        })

        it('emits an error event on client', (done) => {
            client.onError = jest.fn()
            const { requestId } = requests[requests.length - 1]
            const errorResponse = new ErrorResponse({
                errorMessage: 'Test error',
                requestId,
                errorCode: 'error code'
            })

            client.once('error', async (err) => {
                errors.pop()
                expect(err.message).toEqual(errorResponse.errorMessage)
                expect(client.onError).toHaveBeenCalled()
                done()
            })
            connection.emitMessage(errorResponse)
        })
    })

    describe('error', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription('stream1', () => {}).once('subscribed', () => done())
        })

        it('reports InvalidJsonErrors to subscriptions', (done) => {
            const jsonError = new Errors.InvalidJsonError(
                sub.streamId,
                'invalid json',
                new Error('Invalid JSON: invalid json'),
                getStreamMessage(sub.streamId, {})
            )

            sub.handleError = async (err) => {
                expect(err).toBe(jsonError)
                done()
            }
            connection.emit('error', jsonError)
        })

        it('emits other errors as error events on client', (done) => {
            client.onError = jest.fn()
            const testError = new Error('This is a test error message, ignore')

            client.once('error', async (err) => {
                expect(err).toBe(testError)
                expect(client.onError).toHaveBeenCalled()
                done()
            })
            client.once('error', () => {
                errors.pop()
            })
            connection.emit('error', testError)
        })
    })

    describe('connect()', () => {
        it('should return a promise which resolves when connected', async () => {
            const result = client.connect()
            expect(result).toBeInstanceOf(Promise)
            await result
        })

        it('should call connection.connect()', () => {
            connection.connect = jest.fn(async () => {})
            client.connect()
            expect(connection.connect).toHaveBeenCalledTimes(1)
        })

        it('should reject promise while connecting', async (done) => {
            client.onError = jest.fn()
            connection.state = Connection.State.CONNECTING
            client.once('error', (err) => {
                errors.pop()
                expect(err).toMatchObject({
                    message: 'Already connecting!'
                })
                expect(client.onError).toHaveBeenCalledTimes(1)
                done()
            })
            await expect(() => (
                client.connect()
            )).rejects.toThrow()
        })

        it('should reject promise when connected', async (done) => {
            client.onError = jest.fn()
            connection.state = Connection.State.CONNECTED
            client.once('error', (err) => {
                errors.pop()
                expect(err).toMatchObject({
                    message: 'Already connected!'
                })
                expect(client.onError).toHaveBeenCalledTimes(1)
                done()
            })
            await expect(() => (
                client.connect()
            )).rejects.toThrow()
        })
    })

    describe('resend()', () => {
        async function mockResend(...opts) {
            let sub
            connection.send = jest.fn(async (request) => {
                requests.push(request)
                await wait()
                if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                    connection.emitMessage(new SubscribeResponse({
                        streamId: sub.streamId,
                        requestId: request.requestId,
                        streamPartition,
                    }))
                }

                if (request.type === ControlMessage.TYPES.UnsubscribeRequest) {
                    connection.emitMessage(new UnsubscribeResponse({
                        streamId: sub.streamId,
                        requestId: request.requestId,
                        streamPartition,
                    }))
                }
            })
            sub = await client.resend(...opts)
            sub.on('error', onError)
            return sub
        }

        it('should not send SubscribeRequest on reconnection', async () => {
            await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})
            await client.pause()
            await client.connect()
            expect(connection.send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })

        it('should not send SubscribeRequest after ResendResponseNoResend on reconnection', async () => {
            const sub = await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})
            const { requestId } = requests[requests.length - 1]
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await client.pause()
            await client.connect()
            expect(connection.send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })

        it('should not send SubscribeRequest after ResendResponseResent on reconnection', async () => {
            const sub = await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})

            const { requestId } = requests[requests.length - 1]
            const streamMessage = getStreamMessage(sub.streamId, {})
            connection.emitMessage(new UnicastMessage({
                requestId,
                streamMessage,
            }))
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await client.pause()
            await client.connect()
            expect(requests.filter((req) => req.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })
    })

    describe('subscribe()', () => {
        it('should call client.connect() if autoConnect is set to true', (done) => {
            client.options.autoConnect = true
            client.once('connected', done)

            client.subscribe('stream1', () => {})
        })

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('throws an error if no options are given', () => {
                expect(() => {
                    client.subscribe(undefined, () => {})
                }).toThrow()
            })

            it('throws an error if options is wrong type', () => {
                expect(() => {
                    client.subscribe(['streamId'], () => {})
                }).toThrow()
            })

            it('throws an error if no callback is given', () => {
                expect(() => {
                    client.subscribe('stream1')
                }).toThrow()
            })

            it('sends a subscribe request', (done) => {
                const sub = mockSubscription('stream1', () => {})
                sub.once('subscribed', () => {
                    const lastRequest = requests[requests.length - 1]
                    expect(lastRequest).toEqual(new SubscribeRequest({
                        streamId: sub.streamId,
                        streamPartition: sub.streamPartition,
                        requestId: lastRequest.requestId,
                        sessionToken: 'session-token'
                    }))
                    done()
                })
            })

            it('sets the group keys if passed as arguments', () => {
                const groupKey = crypto.randomBytes(32)
                const sub = client.subscribe({
                    stream: 'stream1',
                    groupKeys: {
                        publisherId: groupKey
                    }
                }, () => {})
                expect(client.options.subscriberGroupKeys).toHaveProperty('stream1.publisherId.start')
                expect(client.options.subscriberGroupKeys.stream1.publisherId.groupKey).toEqual(groupKey)
                expect(sub.groupKeys['publisherId'.toLowerCase()]).toEqual(groupKey)
            })

            it('sends a subscribe request for a given partition', (done) => {
                const sub = mockSubscription({
                    stream: 'stream1',
                    partition: 5,
                }, () => {}).once('subscribed', () => {
                    const lastRequest = requests[requests.length - 1]
                    expect(lastRequest).toEqual(new SubscribeRequest({
                        streamId: sub.streamId,
                        streamPartition: 5,
                        requestId: lastRequest.requestId,
                        sessionToken,
                    }))
                    done()
                })
            })

            it('sends subscribe request for each subscribed partition', async () => {
                const tasks = []
                for (let i = 0; i < 3; i++) {
                    tasks.push(new Promise((resolve) => {
                        const s = mockSubscription({
                            stream: 'stream1',
                            partition: i,
                        }, () => {})
                            .once('subscribed', () => resolve(s))
                    }))
                }
                const subs = await Promise.all(tasks)

                subs.forEach((sub, i) => {
                    const request = requests[i]
                    expect(request).toEqual(new SubscribeRequest({
                        streamId: sub.streamId,
                        streamPartition: i,
                        requestId: request.requestId,
                        sessionToken,
                    }))
                })
            })

            it('accepts stream id as first argument instead of object', async () => {
                client.subscribe('stream1', () => {})
                await wait()
                const request = requests[0]
                expect(request).toEqual(new SubscribeRequest({
                    streamId: 'stream1',
                    streamPartition: 0,
                    requestId: request.requestId,
                    sessionToken,
                }))
            })

            it('sends only one subscribe request to server even if there are multiple subscriptions for same stream', async () => {
                const sub = mockSubscription('stream1', () => {})
                const sub2 = mockSubscription('stream1', () => {})
                await Promise.all([
                    new Promise((resolve) => sub.once('subscribed', resolve)),
                    new Promise((resolve) => sub2.once('subscribed', resolve))
                ])
                expect(requests).toHaveLength(1)
                const request = requests[0]
                expect(request).toEqual(new SubscribeRequest({
                    streamId: sub.streamId,
                    streamPartition: sub.streamPartition,
                    requestId: request.requestId,
                    sessionToken,
                }))
                // sets subscribed state on subsequent subscriptions without further subscribe requests
                expect(sub.getState()).toEqual(Subscription.State.subscribed)
                expect(sub2.getState()).toEqual(Subscription.State.subscribed)
            })

            describe('with resend options', () => {
                it('supports resend.from', (done) => {
                    const ref = new MessageRef(5, 0)
                    const sub = mockSubscription({
                        stream: 'stream1',
                        resend: {
                            from: {
                                timestamp: ref.timestamp,
                                sequenceNumber: ref.sequenceNumber,
                            },
                            publisherId: 'publisherId',
                        },
                    }, () => {})
                    sub.once('subscribed', async () => {
                        await wait(200)
                        const lastRequest = requests[requests.length - 1]
                        expect(lastRequest).toEqual(new ResendFromRequest({
                            streamId: sub.streamId,
                            streamPartition: sub.streamPartition,
                            requestId: lastRequest.requestId,
                            publisherId: 'publisherId',
                            fromMsgRef: ref,
                            sessionToken,
                        }))
                        const streamMessage = getStreamMessage(sub.streamId, {})
                        connection.emitMessage(new UnicastMessage({
                            requestId: lastRequest.requestId,
                            streamMessage,
                        }))
                        // TODO validate message
                        await wait(STORAGE_DELAY + 200)
                        sub.stop()
                        done()
                    })
                }, STORAGE_DELAY + 1000)

                it('supports resend.last', (done) => {
                    const sub = mockSubscription({
                        stream: 'stream1',
                        resend: {
                            last: 5,
                        },
                    }, () => {})
                    sub.once('subscribed', async () => {
                        await wait(200)
                        const lastRequest = requests[requests.length - 1]
                        expect(lastRequest).toEqual(new ResendLastRequest({
                            streamId: sub.streamId,
                            streamPartition: sub.streamPartition,
                            requestId: lastRequest.requestId,
                            numberLast: 5,
                            sessionToken,
                        }))
                        const streamMessage = getStreamMessage(sub.streamId, {})
                        connection.emitMessage(new UnicastMessage({
                            requestId: lastRequest.requestId,
                            streamMessage,
                        }))
                        // TODO validate message
                        await wait(STORAGE_DELAY + 200)
                        sub.stop()
                        done()
                    })
                }, STORAGE_DELAY + 1000)

                it('sends a ResendLastRequest if no StreamMessage received and a ResendResponseNoResend received', async () => {
                    const sub = client.subscribe({
                        stream: 'stream1',
                        resend: {
                            last: 5,
                        },
                    }, () => {})
                    connection.send = async (request) => {
                        requests.push(request)
                        await wait()
                        if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                            connection.emitMessage(new SubscribeResponse({
                                streamId: sub.streamId,
                                requestId: request.requestId,
                                streamPartition: request.streamPartition,
                            }))
                        }

                        if (request.type === ControlMessage.TYPES.ResendLastRequest) {
                            const resendResponse = new ResendResponseNoResend({
                                streamId: sub.streamId,
                                streamPartition: sub.streamPartition,
                                requestId: request.requestId
                            })
                            connection.emitMessage(resendResponse)
                        }
                    }

                    await wait(STORAGE_DELAY + 200)
                    sub.stop()
                    expect(requests).toHaveLength(2)
                    const lastRequest = requests[requests.length - 1]
                    expect(lastRequest).toEqual(new ResendLastRequest({
                        streamId: sub.streamId,
                        streamPartition: sub.streamPartition,
                        requestId: lastRequest.requestId,
                        numberLast: 5,
                        sessionToken,
                    }))
                }, STORAGE_DELAY + 1000)

                it('throws if multiple resend options are given', () => {
                    expect(() => {
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
                    }).toThrow()
                })
            })

            describe('Subscription event handling', () => {
                describe('gap', () => {
                    it('sends resend request', (done) => {
                        const sub = mockSubscription('streamId', () => {})
                        sub.once('subscribed', async () => {
                            await wait()
                            const fromRef = new MessageRef(1, 0)
                            const toRef = new MessageRef(5, 0)

                            const fromRefObject = {
                                timestamp: fromRef.timestamp,
                                sequenceNumber: fromRef.sequenceNumber,
                            }
                            const toRefObject = {
                                timestamp: toRef.timestamp,
                                sequenceNumber: toRef.sequenceNumber,
                            }
                            sub.emit('gap', fromRefObject, toRefObject, 'publisherId', 'msgChainId')
                            await wait(100)

                            expect(requests).toHaveLength(2)
                            const lastRequest = requests[requests.length - 1]
                            expect(lastRequest).toEqual(new ResendRangeRequest({
                                streamId: sub.streamId,
                                streamPartition: sub.streamPartition,
                                requestId: lastRequest.requestId,
                                fromMsgRef: fromRef,
                                toMsgRef: toRef,
                                msgChainId: lastRequest.msgChainId,
                                publisherId: lastRequest.publisherId,
                                sessionToken,
                            }))
                            done()
                        })
                    })

                    it('does not send another resend request while resend is in progress', (done) => {
                        const sub = mockSubscription('streamId', () => {})
                        sub.once('subscribed', async () => {
                            await wait()
                            const fromRef = new MessageRef(1, 0)
                            const toRef = new MessageRef(5, 0)
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
                            await wait()
                            expect(requests).toHaveLength(2)
                            const lastRequest = requests[requests.length - 1]
                            expect(lastRequest).toEqual(new ResendRangeRequest({
                                streamId: sub.streamId,
                                streamPartition: sub.streamPartition,
                                requestId: lastRequest.requestId,
                                fromMsgRef: fromRef,
                                toMsgRef: toRef,
                                msgChainId: lastRequest.msgChainId,
                                publisherId: lastRequest.publisherId,
                                sessionToken,
                            }))
                            done()
                        })
                    })
                })

                describe('done', () => {
                    it('unsubscribes', (done) => {
                        const sub = mockSubscription('stream1', () => {})

                        client.unsubscribe = (unsub) => {
                            expect(sub).toBe(unsub)
                            done()
                        }
                        sub.once('subscribed', async () => {
                            await wait()
                            sub.emit('done')
                        })
                    })
                })
            })
        })
    })

    describe('unsubscribe()', () => {
        // Before each, client is connected and subscribed
        let sub
        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription('stream1', () => {
                errors.push(new Error('should not fire message handler'))
            })
            sub.once('subscribed', () => done())
        })

        it('sends an unsubscribe request', async () => {
            client.unsubscribe(sub)
            await wait()
            expect(requests).toHaveLength(2)
            const lastRequest = requests[requests.length - 1]
            expect(lastRequest).toEqual(new UnsubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: lastRequest.requestId,
                sessionToken,
            }))
        })

        it('does not send unsubscribe request if there are other subs remaining for the stream', async () => {
            client.subscribe({
                stream: sub.streamId,
            }, () => {})

            client.unsubscribe(sub)
            await wait()
            expect(requests).toHaveLength(1)
        })

        it('sends unsubscribe request when the last subscription is unsubscribed', (done) => {
            const sub2 = client.subscribe({
                stream: sub.streamId,
            }, () => {})

            sub2.once('subscribed', async () => {
                client.unsubscribe(sub)
                client.unsubscribe(sub2)
                await wait()
                const lastRequest = requests[requests.length - 1]
                expect(lastRequest).toEqual(new UnsubscribeRequest({
                    streamId: sub.streamId,
                    streamPartition: sub.streamPartition,
                    requestId: lastRequest.requestId,
                    sessionToken,
                }))
                done()
            })
        })

        it('does not send an unsubscribe request again if unsubscribe is called multiple times', async () => {
            client.unsubscribe(sub)
            client.unsubscribe(sub)
            await wait()
            expect(requests).toHaveLength(2)
            const lastRequest = requests[requests.length - 1]
            expect(lastRequest).toEqual(new UnsubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: lastRequest.requestId,
                sessionToken,
            }))
        })

        it('does not send another unsubscribed event if the same Subscription is already unsubscribed', async () => {
            const handler = jest.fn()

            sub.on('unsubscribed', handler)
            client.unsubscribe(sub)
            await wait()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)

            client.unsubscribe(sub)
            await wait()
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('throws if no Subscription is given', () => {
            expect(() => {
                client.unsubscribe()
            }).toThrow()
        })

        it('throws if Subscription is of wrong type', () => {
            expect(() => {
                client.unsubscribe(sub.streamId)
            }).toThrow()
        })
    })

    describe('publish', () => {
        function getPublishRequest(content, streamId, timestamp, seqNum, prevMsgRef, requestId) {
            const messageId = new MessageID(streamId, 0, timestamp, seqNum, StubbedStreamrClient.hashedUsername, client.msgCreationUtil.msgChainId)
            const streamMessage = new StreamMessage({
                messageId,
                prevMsgRef,
                content,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            })
            return new ControlLayer.PublishRequest({
                requestId,
                streamMessage,
                sessionToken,
            })
        }

        it('queues messages and sends them once connected', async (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            const ts = Date.now()
            const messages = []
            const ITEMS = 10

            for (let i = 0; i < ITEMS; i++) {
                messages.push({
                    value: uid('msg'),
                })
            }

            connection.once('connected', () => {
                setTimeout(() => {
                    let prevMsgRef = null
                    expect(requests).toHaveLength(ITEMS)
                    requests.forEach((request, i) => {
                        expect(request).toEqual(getPublishRequest(messages[i], 'streamId', ts, i, prevMsgRef, request.requestId))
                        prevMsgRef = new MessageRef(ts, i)
                    })
                    done()
                }, 1000)
            })

            await Promise.all(messages.map((pubMsg) => (
                client.publish('streamId', pubMsg, ts)
            )))
        })

        it('accepts timestamp as date instead of number', async (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            const date = new Date()
            const pubMsg = {
                value: uid('msg'),
            }
            connection.once('connected', () => {
                setTimeout(() => {
                    expect(requests).toEqual([
                        getPublishRequest(pubMsg, 'streamId', date.getTime(), 0, null, requests[0].requestId),
                    ])
                    done()
                }, 1000)
            })
            await client.publish('streamId', pubMsg, date)
        })

        it('accepts timestamp as date string instead of number', async (done) => {
            client.options.autoConnect = true
            client.options.auth.username = 'username'
            const pubMsg = {
                value: uid('msg'),
            }
            connection.once('connected', () => {
                setTimeout(() => {
                    expect(requests).toEqual([
                        getPublishRequest(pubMsg, 'streamId', 123, 0, null, requests[0].requestId),
                    ])
                    done()
                }, 1000)
            })
            await client.publish('streamId', pubMsg, '1970-01-01T00:00:00.123Z')
        })

        it('rejects the promise if autoConnect is false and the client is not connected', async () => {
            client.options.auth.username = 'username'
            client.options.autoConnect = false
            const pubMsg = {
                value: uid('msg'),
            }
            await expect(() => (
                client.publish('stream1', pubMsg)
            )).rejects.toThrow(FailedToPublishError)
        })

        it('subsequent calls to "publish()" should not call "getStream()" (must be cached)', async () => {
            client.options.auth.username = 'username'
            await client.connect()

            const ts = Date.now()
            const pubMsg = {
                value: uid('msg'),
            }
            await client.publish('streamId', pubMsg, ts)
            expect(client.getStream.called).toBeTruthy()

            await client.publish('streamId', pubMsg, ts)
            expect(client.getStream.calledOnce).toBeTruthy()
        })
    })

    describe('disconnect()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = () => done()
            client.disconnect()
        })

        it('resets subscriptions', async () => {
            const sub = mockSubscription('stream1', () => {})
            await client.disconnect()
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })
    })

    describe('pause()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = done
            client.pause()
        })

        it('does not reset subscriptions', async () => {
            const sub = mockSubscription('stream1', () => {})
            await client.pause()
            expect(client.getSubscriptions(sub.streamId)).toEqual([sub])
        })
    })

    describe('Fields set', () => {
        it('sets auth.apiKey from authKey', () => {
            const c = new StubbedStreamrClient({
                authKey: 'authKey',
            }, createConnectionMock())
            expect(c.options.auth.apiKey).toBeTruthy()
        })

        it('sets auth.apiKey from apiKey', () => {
            const c = new StubbedStreamrClient({
                apiKey: 'apiKey',
            }, createConnectionMock())
            expect(c.options.auth.apiKey).toBeTruthy()
        })

        it('sets private key with 0x prefix', (done) => {
            connection = createConnectionMock()
            const c = new StubbedStreamrClient({
                auth: {
                    privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                },
            }, connection)
            c.connect()
            c.session = {
                getSessionToken: sinon.stub().resolves('session-token')
            }
            c.once('connected', async () => {
                await wait()
                expect(requests[0]).toEqual(new SubscribeRequest({
                    streamId: getKeyExchangeStreamId('0x650EBB201f635652b44E4afD1e0193615922381D'),
                    streamPartition: 0,
                    sessionToken,
                    requestId: requests[0].requestId,
                }))
                expect(c.options.auth.privateKey.startsWith('0x')).toBeTruthy()
                done()
            })
        })

        it('sets unauthenticated', () => {
            const c = new StubbedStreamrClient({}, createConnectionMock())
            expect(c.session.options.unauthenticated).toBeTruthy()
        })

        it('sets start time of group key', () => {
            const groupKey = crypto.randomBytes(32)
            const c = new StubbedStreamrClient({
                subscriberGroupKeys: {
                    streamId: {
                        publisherId: groupKey
                    }
                }
            }, createConnectionMock())
            expect(c.options.subscriberGroupKeys.streamId.publisherId.groupKey).toBe(groupKey)
            expect(c.options.subscriberGroupKeys.streamId.publisherId.start).toBeTruthy()
        })

        it('keeps start time passed in the constructor', () => {
            const groupKey = crypto.randomBytes(32)
            const c = new StubbedStreamrClient({
                subscriberGroupKeys: {
                    streamId: {
                        publisherId: {
                            groupKey,
                            start: 12
                        }
                    }
                }
            }, createConnectionMock())
            expect(c.options.subscriberGroupKeys.streamId.publisherId.groupKey).toBe(groupKey)
            expect(c.options.subscriberGroupKeys.streamId.publisherId.start).toBe(12)
        })

        it('updates the latest group key with a more recent key', () => {
            const c = new StubbedStreamrClient({
                subscriberGroupKeys: {
                    streamId: {
                        publisherId: crypto.randomBytes(32)
                    }
                }
            }, createConnectionMock())
            c.subscribedStreamPartitions = {
                streamId0: {
                    setSubscriptionsGroupKeys: sinon.stub()
                }
            }
            const newGroupKey = {
                groupKey: crypto.randomBytes(32),
                start: Date.now() + 2000
            }
            // eslint-disable-next-line no-underscore-dangle
            c._setGroupKeys('streamId', 'publisherId', [newGroupKey])
            expect(c.options.subscriberGroupKeys.streamId.publisherId).toBe(newGroupKey)
        })

        it('does not update the latest group key with an older key', () => {
            const groupKey = crypto.randomBytes(32)
            const c = new StubbedStreamrClient({
                subscriberGroupKeys: {
                    streamId: {
                        publisherId: groupKey
                    }
                }
            }, createConnectionMock())
            c.subscribedStreamPartitions = {
                streamId0: {
                    setSubscriptionsGroupKeys: sinon.stub()
                }
            }
            const oldGroupKey = {
                groupKey: crypto.randomBytes(32),
                start: Date.now() - 2000
            }
            // eslint-disable-next-line no-underscore-dangle
            c._setGroupKeys('streamId', 'publisherId', [oldGroupKey])
            expect(c.options.subscriberGroupKeys.streamId.publisherId.groupKey).toBe(groupKey)
        })
    })

    describe('StreamrClient.generateEthereumAccount()', () => {
        it('generates a new Ethereum account', () => {
            const result = StubbedStreamrClient.generateEthereumAccount()
            const wallet = new Wallet(result.privateKey)
            expect(result.address).toEqual(wallet.address)
        })
    })
})

