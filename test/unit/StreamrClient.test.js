import sinon from 'sinon'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import { wait, waitForEvent } from 'streamr-test-utils'

import FailedToPublishError from '../../src/errors/FailedToPublishError'
import Subscription from '../../src/Subscription'
import Connection from '../../src/Connection'
// import StreamrClient from '../../src/StreamrClient'
import { uid } from '../utils'

// eslint-disable-next-line import/no-named-as-default-member
import StubbedStreamrClient from './StubbedStreamrClient'

/* eslint-disable no-underscore-dangle */

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

describe('StreamrClient', () => {
    let client
    let connection
    let requests = []

    const streamPartition = 0
    const sessionToken = 'session-token'

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
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
            signature: '',
        })
    }

    function createConnectionMock() {
        const c = new Connection({})

        c.expectedMessagesToSend = []

        c._send = jest.fn(async (request) => {
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

    async function mockSubscription(...opts) {
        connection._send = jest.fn(async (request) => {
            requests.push(request)
            await wait()
            if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                connection.emitMessage(new SubscribeResponse({
                    streamId: request.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }

            if (request.type === ControlMessage.TYPES.UnsubscribeRequest) {
                connection.emitMessage(new UnsubscribeResponse({
                    streamId: request.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }
        })
        return client.subscribe(...opts)
    }

    const STORAGE_DELAY = 2000

    beforeEach(() => {
        errors = []
        requests = []
        connection = createConnectionMock()
        client = new StubbedStreamrClient({
            autoConnect: false,
            autoDisconnect: false,
            verifySignatures: 'never',
            retryResendAfter: STORAGE_DELAY,
            url: 'wss://echo.websocket.org/',
            auth: {
                sessionToken: 'session-token',
            },
        }, connection)

        connection.options = client.options
        client.on('error', onError)
    })

    afterEach(() => {
        client.removeListener('error', onError)
        expect(errors[0]).toBeFalsy()
        expect(errors).toHaveLength(0)
    })

    afterEach(async () => {
        await client.disconnect()
        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    afterAll(async () => {
        await wait(3000) // give tests a few more moments to clean up
    })

    describe('connecting behaviour', () => {
        it('connected event should emit an event on client', async (done) => {
            client.once('connected', () => {
                done()
            })
            await client.connect()
        })

        it('should not send anything if not subscribed to anything', async () => {
            await client.connect()
            expect(connection._send).not.toHaveBeenCalled()
        })

        it('should send pending subscribes', async () => {
            const t = mockSubscription('stream1', () => {})

            await client.connect()
            await wait()
            await t
            expect(connection._send.mock.calls).toHaveLength(1)
            expect(connection._send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })

        it('should reconnect subscriptions when connection disconnected before subscribed & reconnected', async () => {
            await client.connect()
            let subscribed = false
            const t = mockSubscription('stream1', () => {}).then((v) => {
                subscribed = true
                return v
            })
            connection.socket.close()
            expect(subscribed).toBe(false) // shouldn't have subscribed yet
            // no connect necessary should connect and subscribe
            await t
            expect(connection._send.mock.calls).toHaveLength(2)
            // On connect
            expect(connection._send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })

            // On reconnect
            expect(connection._send.mock.calls[1][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })

        it('should re-subscribe when subscribed then reconnected', async () => {
            await client.connect()
            await mockSubscription('stream1', () => {})
            connection.socket.close()
            await client.nextConnection()
            // no connect necessary should auto-reconnect and subscribe
            expect(connection._send.mock.calls).toHaveLength(2)
            // On connect
            expect(connection._send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })

            // On reconnect
            expect(connection._send.mock.calls[1][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })
        // TODO convert and move all super mocked tests to integration
    })

    describe('promise subscribe behaviour', () => {
        beforeEach(async () => client.connect())

        it('works', async () => {
            const sub = await mockSubscription('stream1', () => {})
            expect(sub).toBeTruthy()
            expect(sub.streamId).toBe('stream1')
            await client.unsubscribe(sub)
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })
    })

    describe('disconnection behaviour', () => {
        beforeEach(async () => client.connect())

        it('emits disconnected event on client', async (done) => {
            client.once('disconnected', () => done())
            await connection.disconnect()
        })

        it('removes subscriptions', async () => {
            const sub = await mockSubscription('stream1', () => {})
            await client.disconnect()
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })

        it('does not remove subscriptions if disconnected accidentally', async () => {
            const sub = await mockSubscription('stream1', () => {})
            client.connection.socket.close()
            await waitForEvent(client, 'disconnected')
            expect(client.getSubscriptions(sub.streamId)).toEqual([sub])
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
            await client.connect()
            expect(client.getSubscriptions(sub.streamId)).toEqual([sub])
            // re-subscribes
            expect(sub.getState()).toEqual(Subscription.State.subscribing)
        })

        it('sets subscription state to unsubscribed', async () => {
            const sub = await mockSubscription('stream1', () => {})
            await connection.disconnect()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })
    })

    describe('SubscribeResponse', () => {
        beforeEach(async () => client.connect())

        it('marks Subscriptions as subscribed', async () => {
            const sub = await mockSubscription('stream1', () => {})
            expect(sub.getState()).toEqual(Subscription.State.subscribed)
        })

        it('generates a requestId without resend', async () => {
            await mockSubscription({
                stream: 'stream1',
            }, () => {})
            const { requestId } = requests[0]
            expect(requestId).toBeTruthy()
        })

        it('emits a resend request if resend options were given. No second resend if a message is received.', async () => {
            const sub = await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 1,
                },
            }, () => {})
            await wait(100)
            const { requestId, type } = requests[requests.length - 1]
            expect(type).toEqual(ControlMessage.TYPES.ResendLastRequest)
            const streamMessage = getStreamMessage(sub.streamId, {})
            connection.emitMessage(new UnicastMessage({
                requestId,
                streamMessage,
            }))
            await wait(STORAGE_DELAY)
            sub.stop()
            await wait()
            expect(connection._send.mock.calls).toHaveLength(2) // sub + resend
            expect(connection._send.mock.calls[1][0]).toMatchObject({
                type: ControlMessage.TYPES.ResendLastRequest,
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                numberLast: 1,
                sessionToken: 'session-token'
            })
        }, STORAGE_DELAY + 1000)

        it('emits multiple resend requests as per multiple subscriptions. No second resends if messages are received.', async () => {
            const [sub1, sub2] = await Promise.all([
                mockSubscription({
                    stream: 'stream1',
                    resend: {
                        last: 2,
                    },
                }, () => {}),
                mockSubscription({
                    stream: 'stream1',
                    resend: {
                        last: 1,
                    },
                }, () => {})
            ])
            const requestId1 = requests.find((r) => r.numberLast === 2).requestId
            connection.emitMessage(new UnicastMessage({
                requestId: requestId1,
                streamMessage: getStreamMessage(sub1.streamId, {})
            }))

            const requestId2 = requests.find((r) => r.numberLast === 1).requestId
            connection.emitMessage(new UnicastMessage({
                requestId: requestId2,
                streamMessage: getStreamMessage(sub2.streamId, {})
            }))

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

            const calls = connection._send.mock.calls.filter(([o]) => [requestId1, requestId2].includes(o.requestId))
            expect(calls).toHaveLength(2)
            calls.forEach(([actual], index) => {
                const expected = expectedResponses[index]
                expect(actual).toMatchObject({
                    requestId: expected.requestId,
                    streamId: expected.streamId,
                    streamPartition: expected.streamPartition,
                    numberLast: expected.numberLast,
                    sessionToken: expected.sessionToken,
                })
            })
        }, STORAGE_DELAY + 1000)
    })

    describe('UnsubscribeResponse', () => {
        // Before each test, client is connected, subscribed, and unsubscribe() is called
        let sub
        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription('stream1', () => {})
        })

        it('removes the subscription', async () => {
            await client.unsubscribe(sub)
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })

        it('sets Subscription state to unsubscribed', async () => {
            await client.unsubscribe(sub)
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })

        describe('automatic disconnection after last unsubscribe', () => {
            describe('options.autoDisconnect == true', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = true
                })

                it('calls connection.disconnect() when no longer subscribed to any streams', async () => {
                    await client.unsubscribe(sub)
                    expect(client.isDisconnected()).toBeTruthy()
                })
            })

            describe('options.autoDisconnect == false', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = false
                })

                it('should not disconnect if autoDisconnect is set to false', async () => {
                    await client.unsubscribe(sub)
                    expect(client.isConnected()).toBeTruthy()
                })
            })
        })
    })

    describe('BroadcastMessage', () => {
        let sub

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription('stream1', () => {})
        })

        it('should call the message handler of each subscription', async () => {
            sub.handleBroadcastMessage = jest.fn()

            const sub2 = await mockSubscription('stream1', () => {})
            sub2.handleBroadcastMessage = jest.fn()
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)

            expect(sub.handleBroadcastMessage).toHaveBeenCalledWith(msg1.streamMessage, expect.any(Function))
            expect(sub2.handleBroadcastMessage).toHaveBeenCalledWith(msg1.streamMessage, expect.any(Function))
        })

        it('should not crash if messages are received for unknown streams', () => {
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage('unexpected-stream', {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })

        it('should ensure that the promise returned by the verification function is cached and returned for all handlers', async (done) => {
            let firstResult
            sub.handleBroadcastMessage = (message, verifyFn) => {
                firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(verifyFn()).toBe(firstResult)
            }
            const sub2 = await mockSubscription('stream1', () => {})
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

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
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

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
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

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
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

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
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
        beforeEach(async () => {
            await client.connect()
            await mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                }
            }, () => {})
        })

        it('emits an error event on client', (done) => {
            client.onError = jest.fn()
            const { requestId } = requests[requests.length - 1]
            const errorResponse = new ErrorResponse({
                errorMessage: 'Test error',
                requestId,
                errorCode: 'error code'
            })

            client.once('error', (err) => {
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

        beforeEach(async () => {
            await client.connect()
            sub = await mockSubscription('stream1', () => {})
        })

        it('reports InvalidJsonErrors to subscriptions', (done) => {
            const jsonError = new Errors.InvalidJsonError(
                sub.streamId,
                'invalid json',
                new Error('Invalid JSON: invalid json'),
                getStreamMessage(sub.streamId, {})
            )

            sub.handleError = async (err) => {
                expect(err && err.message).toMatch(jsonError.message)
                done()
            }
            connection.emit('error', jsonError)
        })

        it('emits other errors as error events on client', (done) => {
            client.onError = jest.fn()
            const testError = new Error('This is a test error message, ignore')

            client.once('error', (err) => {
                errors.pop()
                expect(err.message).toMatch(testError.message)
                expect(client.onError).toHaveBeenCalled()
                done()
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
    })

    describe('resend()', () => {
        beforeEach(() => {
            client.options.autoConnect = true
        })

        async function mockResend(...opts) {
            const sub = await client.resend(...opts)
            sub.on('error', onError)
            return sub
        }

        it('should reject if cannot send', async () => {
            client.options.autoConnect = false
            await expect(async () => {
                await mockResend({
                    stream: 'stream1',
                    resend: {
                        last: 10
                    }
                }, () => {})
            }).rejects.toThrow()
        })

        it('should not send SubscribeRequest/ResendRequest on reconnection', async () => {
            await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})
            client.connection.socket.close()
            await client.nextConnection()
            client.debug(connection._send.mock.calls)
            expect(connection._send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
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
            client.connection.socket.close()
            await client.nextConnection()
            expect(connection._send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
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
            connection.socket.close()
            await client.connect()
            expect(requests.filter((req) => req.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })
    })

    describe('subscribe()', () => {
        it('should connect if autoConnect is set to true', async () => {
            client.options.autoConnect = true
            await mockSubscription('stream1', () => {})
        })

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('throws an error if no options are given', () => {
                expect(() => (
                    client.subscribe(undefined, () => {})
                )).rejects.toThrow()
            })

            it('throws an error if options is wrong type', () => {
                expect(() => (
                    client.subscribe(['streamId'], () => {})
                )).rejects.toThrow()
            })

            it('throws an error if no callback is given', () => {
                expect(() => (
                    client.subscribe('stream1')
                )).rejects.toThrow()
            })

            it('sends a subscribe request', async () => {
                const sub = await mockSubscription('stream1', () => {})
                const lastRequest = requests[requests.length - 1]
                expect(lastRequest).toEqual(new SubscribeRequest({
                    streamId: sub.streamId,
                    streamPartition: sub.streamPartition,
                    requestId: lastRequest.requestId,
                    sessionToken: 'session-token'
                }))
            })

            it('sends a subscribe request for a given partition', async () => {
                const sub = await mockSubscription({
                    stream: 'stream1',
                    partition: 5,
                }, () => {})
                const lastRequest = requests[requests.length - 1]
                expect(lastRequest).toEqual(new SubscribeRequest({
                    streamId: sub.streamId,
                    streamPartition: 5,
                    requestId: lastRequest.requestId,
                    sessionToken,
                }))
            })

            it('sends subscribe request for each subscribed partition', async () => {
                const tasks = []
                for (let i = 0; i < 3; i++) {
                    tasks.push(mockSubscription({
                        stream: 'stream1',
                        partition: i,
                    }, () => {}))
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

            it('sends just one subscribe request to server even if there are multiple subscriptions for same stream', async () => {
                const [sub, sub2] = await Promise.all([
                    mockSubscription('stream1', () => {}),
                    mockSubscription('stream1', () => {})
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
                it('supports resend.from', async () => {
                    const ref = new MessageRef(5, 0)
                    const sub = await mockSubscription({
                        stream: 'stream1',
                        resend: {
                            from: {
                                timestamp: ref.timestamp,
                                sequenceNumber: ref.sequenceNumber,
                            },
                            publisherId: 'publisherId',
                        },
                    }, () => {})
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
                }, STORAGE_DELAY + 1000)

                it('supports resend.last', async () => {
                    const sub = await mockSubscription({
                        stream: 'stream1',
                        resend: {
                            last: 5,
                        },
                    }, () => {})
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
                }, STORAGE_DELAY + 1000)

                it('sends a ResendLastRequest if no StreamMessage received and a ResendResponseNoResend received', async () => {
                    const t = client.subscribe({
                        stream: 'stream1',
                        resend: {
                            last: 5,
                        },
                    }, () => {})
                    connection._send = async (request) => {
                        requests.push(request)
                        await wait()
                        if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                            connection.emitMessage(new SubscribeResponse({
                                streamId: request.streamId,
                                requestId: request.requestId,
                                streamPartition: request.streamPartition,
                            }))
                        }

                        if (request.type === ControlMessage.TYPES.ResendLastRequest) {
                            const resendResponse = new ResendResponseNoResend({
                                streamId: request.streamId,
                                streamPartition: request.streamPartition,
                                requestId: request.requestId
                            })
                            connection.emitMessage(resendResponse)
                        }
                    }

                    await wait(STORAGE_DELAY + 200)
                    const sub = await t
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
                    expect(() => (
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
                    )).rejects.toThrow()
                })
            })

            describe('Subscription event handling', () => {
                describe('gap', () => {
                    it('sends resend request', async () => {
                        const sub = await mockSubscription('streamId', () => {})
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
                    })

                    it('does not send another resend request while resend is in progress', async () => {
                        const sub = await mockSubscription('streamId', () => {})
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
                    })
                })

                describe('done', () => {
                    it('unsubscribes', async (done) => {
                        const sub = await mockSubscription('stream1', () => {})

                        client.subscriber.unsubscribe = async (unsub) => {
                            expect(sub).toBe(unsub)
                            done()
                        }
                        await wait()
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
            sub = await mockSubscription('stream1', () => {
                errors.push(new Error('should not fire message handler'))
            })
        })

        it('sends an unsubscribe request', async () => {
            await client.unsubscribe(sub)
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
            await mockSubscription({
                stream: sub.streamId,
            }, () => {})

            await client.unsubscribe(sub)
            expect(requests).toHaveLength(1)
        })

        it('sends unsubscribe request when the last subscription is unsubscribed', async () => {
            const sub2 = await mockSubscription(sub.streamId, () => {})

            await client.unsubscribe(sub)
            await client.unsubscribe(sub2)
            const lastRequest = requests[requests.length - 1]
            expect(lastRequest).toEqual(new UnsubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: lastRequest.requestId,
                sessionToken,
            }))
        })

        it('sends only a single unsubscribe request when the last subscription is unsubscribed', async () => {
            const sub2 = await mockSubscription(sub.streamId, () => {})
            requests = []
            await Promise.all([
                client.unsubscribe(sub),
                client.unsubscribe(sub2)
            ])
            expect(requests).toHaveLength(1)
            const lastRequest = requests[requests.length - 1]

            expect(lastRequest).toEqual(new UnsubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: lastRequest.requestId,
                sessionToken,
            }))
        })

        it('does not send an unsubscribe request again if unsubscribe is called multiple times', async () => {
            await client.unsubscribe(sub)
            await client.unsubscribe(sub)
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
            await client.unsubscribe(sub)
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)

            await client.unsubscribe(sub)
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('throws if no Subscription is given', () => {
            expect(async () => {
                await client.unsubscribe()
            }).rejects.toThrow()
        })

        it('throws if Subscription is of wrong type', () => {
            expect(async () => {
                await client.unsubscribe(sub.streamId)
            }).rejects.toThrow()
        })
    })

    describe('publish', () => {
        function getPublishRequest(content, streamId, timestamp, seqNum, prevMsgRef, requestId) {
            const { hashedUsername } = StubbedStreamrClient
            const { msgChainId } = client.publisher.msgCreationUtil
            const messageId = new MessageID(streamId, 0, timestamp, seqNum, hashedUsername, msgChainId)
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
            await expect(async () => (
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

        it('calls connection.disconnect()', async () => {
            const disconnect = jest.spyOn(connection, 'disconnect')
            await client.disconnect()
            expect(disconnect).toHaveBeenCalledTimes(1)
        })
    })

    describe('pause()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', async () => {
            const disconnect = jest.spyOn(connection, 'disconnect')
            await client.pause()
            expect(disconnect).toHaveBeenCalledTimes(1)
        })

        it('does not reset subscriptions', async () => {
            const sub = await mockSubscription('stream1', () => {})
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

        it.skip('sets private key with 0x prefix', (done) => {
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
                    // streamId: getKeyExchangeStreamId('0x650EBB201f635652b44E4afD1e0193615922381D'),
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
    })

    describe('StreamrClient.generateEthereumAccount()', () => {
        it('generates a new Ethereum account', () => {
            const result = StubbedStreamrClient.generateEthereumAccount()
            const wallet = new Wallet(result.privateKey)
            expect(result.address).toEqual(wallet.address)
        })
    })
})
