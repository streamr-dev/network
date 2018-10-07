import assert from 'assert'
import EventEmitter from 'eventemitter3'
import sinon from 'sinon'
import debug from 'debug'

import StreamrClient from '../../src/StreamrClient'
import Connection from '../../src/Connection'
import Subscription from '../../src/Subscription'
import FailedToProduceError from '../../src/errors/FailedToProduceError'
import InvalidJsonError from '../../src/errors/InvalidJsonError'

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

    function setupSubscription(streamId, emitSubscribed = true, subscribeOptions = {}, handler = sinon.stub()) {
        assert(client.isConnected(), 'setupSubscription: Client is not connected!')
        client.connection.expect({
            type: 'subscribe', stream: streamId, authKey: null,
        })
        const sub = client.subscribe({
            stream: streamId,
            ...subscribeOptions,
        }, handler)

        if (emitSubscribed) {
            client.connection.emit('subscribed', {
                stream: sub.streamId,
            })
        }
        return sub
    }

    // ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']

    function msg(streamId, offset, content = {}, subId) {
        return {
            streamId,
            offset,
            content,
            subId,
        }
    }

    function createConnectionMock() {
        const c = new EventEmitter()

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
            assert.deepEqual(
                msgToSend, next,
                `Sending unexpected message: ${JSON.stringify(msgToSend)}
                Expected: ${JSON.stringify(next)}
                Queue: ${JSON.stringify(c.expectedMessagesToSend)}`,
            )
        }

        c.expect = (msgToExpect) => {
            c.expectedMessagesToSend.push(msgToExpect)
        }

        c.checkSentMessages = () => {
            assert.equal(c.expectedMessagesToSend.length, 0, `Expected messages not sent: ${JSON.stringify(c.expectedMessagesToSend)}`)
        }

        return c
    }

    beforeEach(() => {
        clearAsync()
        connection = createConnectionMock()
        client = new StreamrClient({
            autoConnect: false,
            autoDisconnect: false,
        }, connection)
    })

    afterEach(() => {
        connection.checkSentMessages()
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

                connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })

                client.connect()
                connection.on('connected', done)
            })

            it('should send pending subscribes when disconnected and then reconnected', async () => {
                // On connect
                client.connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })
                // On reconnect
                client.connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })

                client.subscribe('stream1', () => {})
                await client.connect()
                await connection.disconnect()
                return client.connect()
            })

            it('should not subscribe to unsubscribed streams on reconnect', (done) => {
                // On connect
                client.connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })
                // On unsubscribe
                client.connection.expect({
                    type: 'unsubscribe', stream: 'stream1',
                })

                const sub = client.subscribe('stream1', () => {})
                client.connect().then(() => {
                    client.connection.emit('subscribed', {
                        stream: 'stream1',
                    })
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', async () => {
                        await client.disconnect()
                        await client.connect()
                        done()
                    })
                    client.connection.emit('unsubscribed', {
                        stream: 'stream1',
                    })
                })
            })

            it('should request resend according to sub.getEffectiveResendOptions()', () => {
                const sub = client.subscribe({
                    stream: 'stream1',
                    resend_all: true,
                }, () => {})

                connection.expect({
                    stream: sub.streamId, type: 'subscribe', authKey: null,
                })

                client.connection.on('connected', () => {
                    sub.getEffectiveResendOptions = () => ({
                        foo: 'bar',
                    })
                    client.connection.expect({
                        foo: 'bar',
                        type: 'resend',
                        stream: 'stream1',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })
                return client.connect()
            })
        })

        describe('disconnected', () => {
            beforeEach(() => client.connect())

            it('emits event on client', (done) => {
                client.on('disconnected', done)
                client.connection.emit('disconnected')
            })

            it('does not remove subscriptions', () => {
                const sub = setupSubscription('stream1')
                client.connection.emit('disconnected')
                assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
            })

            it('sets subscription state to unsubscribed', () => {
                const sub = setupSubscription('stream1')
                client.connection.emit('disconnected')
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })
        })

        describe('subscribed', () => {
            beforeEach(() => client.connect())

            it('marks Subscriptions as subscribed', () => {
                const sub = setupSubscription('stream1')
                assert.equal(sub.getState(), Subscription.State.subscribed)
            })

            it('emits a resend request if resend options were given', () => {
                const sub = setupSubscription('stream1', false, {
                    resend_all: true,
                })
                connection.expect({
                    stream: sub.streamId, resend_all: true, type: 'resend', partition: 0, authKey: null, sub: sub.id,
                })
                client.connection.emit('subscribed', {
                    stream: sub.streamId,
                })
            })

            it('emits multiple resend requests as per multiple subscriptions', () => {
                client.connection.expect({
                    type: 'subscribe', stream: 'stream1', authKey: null,
                })

                const sub1 = client.subscribe({
                    stream: 'stream1', resend_all: true,
                }, () => {})
                const sub2 = client.subscribe({
                    stream: 'stream1', resend_last: 1,
                }, () => {})

                connection.expect({
                    stream: 'stream1', resend_all: true, type: 'resend', partition: 0, authKey: null, sub: sub1.id,
                })
                connection.expect({
                    stream: 'stream1', resend_last: 1, type: 'resend', partition: 0, authKey: null, sub: sub2.id,
                })

                client.connection.emit('subscribed', {
                    stream: 'stream1',
                })
            })
        })

        describe('unsubscribed', () => {
            // Before each test, client is connected, subscribed, and unsubscribe() is called
            let sub
            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1')

                client.connection.expect({
                    type: 'unsubscribe', stream: sub.streamId,
                })
                client.unsubscribe(sub)
            })

            it('removes the subscription', () => {
                client.connection.emit('unsubscribed', {
                    stream: sub.streamId,
                })
                assert.deepEqual(client.getSubscriptions(sub.streamId), [])
            })

            it('sets Subscription state to unsubscribed', () => {
                client.connection.emit('unsubscribed', {
                    stream: sub.streamId,
                })
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })

            describe('automatic disconnection after last unsubscribe', () => {
                describe('options.autoDisconnect == true', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = true
                    })

                    it('calls connection.disconnect() when no longer subscribed to any streams', (done) => {
                        client.connection.disconnect = done
                        client.connection.emit('unsubscribed', {
                            stream: sub.streamId,
                        })
                    })
                })

                describe('options.autoDisconnect == false', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = false
                    })

                    it('should not disconnect if autoDisconnect is set to false', () => {
                        client.connection.disconnect = sinon.stub().throws('Should not call disconnect!')
                        client.connection.emit('unsubscribed', {
                            stream: sub.streamId,
                        })
                    })
                })
            })
        })

        describe('b (broadcast)', () => {
            beforeEach(() => client.connect())

            it('should call the message handler of each subscription', () => {
                client.connection.expect({
                    type: 'subscribe', stream: 'stream1', authKey: null,
                })

                const counter = sinon.stub()

                client.subscribe({
                    stream: 'stream1',
                }, counter)
                client.subscribe({
                    stream: 'stream1',
                }, counter)

                client.connection.emit('subscribed', {
                    stream: 'stream1',
                })
                client.connection.emit('b', msg('stream1'))

                assert.equal(counter.callCount, 2)
            })

            it('should not crash if messages are received for unknown streams', () => {
                setupSubscription('stream1', true, {}, sinon.stub().throws())
                client.connection.emit('b', msg('unexpected-stream'))
            })

            it('does not mutate messages', (done) => {
                const sentMsg = {
                    foo: 'bar',
                }

                setupSubscription('stream1', true, {}, (receivedMsg) => {
                    assert.deepEqual(sentMsg, receivedMsg)
                    done()
                })

                client.connection.emit('b', msg('stream1', 1, sentMsg))
            })
        })

        describe('u (unicast)', () => {
            beforeEach(() => client.connect())

            it('should call the message handler of specified Subscription', (done) => {
                client.connection.expect({
                    type: 'subscribe', stream: 'stream1', authKey: null,
                })

                // this sub's handler must not be called
                client.subscribe({
                    stream: 'stream1',
                }, sinon.stub().throws())

                // this sub's handler must be called
                const sub2 = client.subscribe({
                    stream: 'stream1',
                }, () => {
                    done()
                })

                client.connection.emit('subscribed', {
                    stream: 'stream1',
                })
                client.connection.emit('u', msg('stream1', 1, {}, sub2.id), sub2.id)
            })

            it('ignores messages for unknown Subscriptions', () => {
                setupSubscription('stream1', true, {}, sinon.stub().throws())
                client.connection.emit('u', msg('stream1', 1, {}, 'unknown'), 'unknown')
            })

            it('does not mutate messages', (done) => {
                const sentMsg = {
                    foo: 'bar',
                }

                const sub = setupSubscription('stream1', true, {}, (receivedMsg) => {
                    assert.deepEqual(sentMsg, receivedMsg)
                    done()
                })

                client.connection.emit('u', msg('stream1', 1, sentMsg, sub.id), sub.id)
            })
        })

        describe('resending', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: sub.id,
                }
                sub.on('resending', (event) => {
                    assert.deepEqual(event, resendingMessage)
                    done()
                })
                client.connection.emit('resending', resendingMessage)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: 'unknown id',
                }
                sub.on('resending', sinon.stub().throws())
                client.connection.emit('resending', resendingMessage)
            })
        })

        describe('no_resend', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: sub.id,
                }
                sub.on('no_resend', (event) => {
                    assert.deepEqual(event, resendingMessage)
                    done()
                })
                client.connection.emit('no_resend', resendingMessage)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: 'unknown id',
                }
                sub.on('no_resend', sinon.stub().throws())
                client.connection.emit('no_resend', resendingMessage)
            })
        })

        describe('resent', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: sub.id,
                }
                sub.on('resent', (event) => {
                    assert.deepEqual(event, resendingMessage)
                    done()
                })
                client.connection.emit('resent', resendingMessage)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendingMessage = {
                    sub: 'unknown id',
                }
                sub.on('resent', sinon.stub().throws())
                client.connection.emit('resent', resendingMessage)
            })
        })

        describe('error', () => {
            beforeEach(() => client.connect())

            it('reports InvalidJsonErrors to subscriptions', (done) => {
                const sub = setupSubscription('stream1')
                const jsonError = new InvalidJsonError(sub.streamId)

                sub.handleError = (err) => {
                    assert.equal(err, jsonError)
                    done()
                }
                client.connection.emit('error', jsonError)
            })

            it('emits other errors as error events on client', (done) => {
                setupSubscription('stream1')
                const testError = new Error('This is a test error message, ignore')

                client.on('error', (err) => {
                    assert.equal(err, testError)
                    done()
                })
                client.connection.emit('error', testError)
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
            client.connection.connect = sinon.stub().resolves()
            client.connect()
            assert(client.connection.connect.calledOnce)
        })

        it('should reject promise while connecting', (done) => {
            client.connection.state = Connection.State.CONNECTING
            client.connect().catch(() => done())
        })

        it('should reject promise when connected', (done) => {
            client.connection.state = Connection.State.CONNECTED
            client.connect().catch(() => done())
        })
    })

    describe('subscribe()', () => {
        it('should call client.connect() if autoConnect is set to true', (done) => {
            client.options.autoConnect = true
            client.on('connected', done)

            client.connection.expect({
                type: 'subscribe', stream: 'stream1', authKey: null,
            })
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
                connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: 'auth',
                })

                client.subscribe({
                    stream: 'stream1', apiKey: 'auth',
                }, () => {})
            })

            it('accepts stream id as first argument instead of object', () => {
                connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })

                client.subscribe('stream1', () => {})
            })

            it('sends only one subscribe request to server even if there are multiple subscriptions for same stream', () => {
                connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })

                client.subscribe('stream1', () => {})
                client.subscribe('stream1', () => {})
            })

            it('sets subscribed state on subsequent subscriptions without further subscribe requests', (done) => {
                connection.expect({
                    stream: 'stream1', type: 'subscribe', authKey: null,
                })

                client.subscribe('stream1', () => {})
                client.connection.emit('subscribed', {
                    stream: 'stream1',
                })

                const sub2 = client.subscribe('stream1', () => {})
                sub2.on('subscribed', () => {
                    assert.equal(sub2.getState(), Subscription.State.subscribed)
                    done()
                })
            })

            describe('with resend options', () => {
                it('supports resend_all', () => {
                    const sub = setupSubscription('stream1', false, {
                        resend_all: true,
                    })
                    client.connection.expect({
                        stream: sub.streamId,
                        resend_all: true,
                        type: 'resend',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })

                it('supports resend_from', () => {
                    const sub = setupSubscription('stream1', false, {
                        resend_from: 5,
                    })
                    client.connection.expect({
                        stream: sub.streamId,
                        resend_from: 5,
                        type: 'resend',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })

                it('supports resend_last', () => {
                    const sub = setupSubscription('stream1', false, {
                        resend_last: 5,
                    })
                    client.connection.expect({
                        stream: sub.streamId,
                        resend_last: 5,
                        type: 'resend',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })

                it('supports resend_from_time', () => {
                    const time = Date.now()
                    const sub = setupSubscription('stream1', false, {
                        resend_from_time: time,
                    })
                    client.connection.expect({
                        stream: sub.streamId,
                        resend_from_time: time,
                        type: 'resend',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })

                it('supports resend_from_time given as a Date object', () => {
                    const time = new Date()
                    const sub = setupSubscription('stream1', false, {
                        resend_from_time: time,
                    })
                    client.connection.expect({
                        stream: sub.streamId,
                        resend_from_time: time.getTime(),
                        type: 'resend',
                        partition: 0,
                        authKey: null,
                        sub: sub.id,
                    })
                    client.connection.emit('subscribed', {
                        stream: sub.streamId,
                    })
                })

                it('throws if resend_from_time is invalid', () => {
                    assert.throws(() => {
                        client.subscribe({
                            stream: 'stream1',
                            resend_from_time: 'invalid',
                        }, () => {})
                    })
                })

                it('throws if multiple resend options are given', () => {
                    assert.throws(() => {
                        client.subscribe({
                            stream: 'stream1', apiKey: 'auth', resend_all: true, resend_last: 5,
                        }, () => {})
                    })
                })
            })

            describe('Subscription event handling', () => {
                describe('gap', () => {
                    it('sends resend request', () => {
                        const sub = setupSubscription('stream1')
                        connection.expect({
                            stream: 'stream1',
                            resend_from: 1,
                            resend_to: 5,
                            type: 'resend',
                            partition: 0,
                            authKey: null,
                            sub: sub.id,
                        })

                        sub.emit('gap', 1, 5)
                    })

                    it('does not send another resend request while resend is in progress', () => {
                        const sub = setupSubscription('stream1')
                        connection.expect({
                            stream: 'stream1',
                            resend_from: 1,
                            resend_to: 5,
                            type: 'resend',
                            partition: 0,
                            authKey: null,
                            sub: sub.id,
                        })

                        sub.emit('gap', 1, 5)
                        sub.emit('gap', 1, 10)
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
            client.connection.expect({
                type: 'unsubscribe', stream: sub.streamId,
            })

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

                client.connection.expect({
                    type: 'unsubscribe', stream: sub.streamId,
                })
                client.unsubscribe(sub2)
                done()
            })
        })

        it('does not send an unsubscribe request again if unsubscribe is called multiple times', () => {
            client.connection.expect({
                type: 'unsubscribe', stream: sub.streamId,
            })

            client.unsubscribe(sub)
            client.unsubscribe(sub)
        })

        it('does not send another unsubscribed event if the same Subscription is already unsubscribed', () => {
            client.connection.expect({
                type: 'unsubscribe', stream: sub.streamId,
            })
            const handler = sinon.stub()

            sub.on('unsubscribed', handler)
            client.unsubscribe(sub)
            client.connection.emit('unsubscribed', {
                stream: sub.streamId,
            })
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

    describe('disconnect()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            client.connection.disconnect = done
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
            client.connection.disconnect = done
            client.pause()
        })

        it('does not reset subscriptions', async () => {
            const sub = setupSubscription('stream1')
            await client.pause()
            assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
        })
    })

    describe('produceToStream', () => {
        const pubMsg = {
            foo: 'bar',
        }

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('returns and resolves a promise', () => {
                client.options.autoConnect = true
                client.connection.expect({
                    type: 'publish',
                    stream: 'stream1',
                    authKey: null,
                    msg: '{"foo":"bar"}',
                })
                const promise = client.produceToStream('stream1', pubMsg)
                assert(promise instanceof Promise)
                return promise
            })
        })

        describe('when not connected', () => {
            it('queues messages and sends them once connected', (done) => {
                client.options.autoConnect = true

                // Produce 10 messages
                for (let i = 0; i < 10; i++) {
                    client.connection.expect({
                        type: 'publish',
                        stream: 'stream1',
                        authKey: null,
                        msg: JSON.stringify(pubMsg),
                    })
                    // Messages will be queued until connected
                    client.produceToStream('stream1', pubMsg)
                }

                client.connection.on('connected', done)
            })

            it('rejects the promise if autoConnect is false and the client is not connected', (done) => {
                client.options.autoConnect = false
                assert.equal(client.isConnected(), false)
                client.produceToStream('stream1', pubMsg).catch((err) => {
                    assert(err instanceof FailedToProduceError)
                    done()
                })
            })
        })
    })
})

