import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import fetch from 'node-fetch'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { wait, waitForEvent } from 'streamr-test-utils'
import { ethers } from 'ethers'

import { uid } from '../utils'
import StreamrClient from '../../src'

import config from './config'

const { StreamMessage } = MessageLayer
const WebSocket = require('ws')

const { SubscribeRequest, UnsubscribeRequest, ResendLastRequest } = ControlLayer

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

describe('StreamrClient Connection', () => {
    describe('bad config.url', () => {
        it('emits error without autoconnect', async () => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.onError = jest.fn()

            await expect(() => (
                client.connect()
            )).rejects.toThrow()
            expect(client.onError).toHaveBeenCalledTimes(1)
        })

        it('rejects on connect without autoconnect', async () => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.onError = jest.fn()

            await expect(() => (
                client.connect()
            )).rejects.toThrow()
            expect(client.onError).toHaveBeenCalledTimes(1)
        })

        it('emits error with autoconnect after first call that triggers connect()', async () => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: true,
                autoDisconnect: true,
            })
            const client2 = createClient({
                autoConnect: true,
                autoDisconnect: true,
            })

            client.onError = jest.fn()
            const onError = jest.fn()
            client.on('error', onError)

            const stream = await client2.createStream({
                name: uid('stream')
            }) // this will succeed because it uses restUrl config, not url

            // publish should trigger connect
            await expect(() => (
                client.publish(stream, {})
            )).rejects.toThrow('Invalid URL')
            // check error is emitted with same error before rejection
            // not clear if emit or reject *should* occur first
            expect(onError).toHaveBeenCalledTimes(1)
            expect(client.onError).toHaveBeenCalledTimes(1)
        }, 10000)
    })

    describe('bad config.restUrl', () => {
        it('emits no error with no connection', async (done) => {
            const client = createClient({
                restUrl: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.onError = jest.fn()
            client.once('error', done)
            setTimeout(() => {
                expect(client.onError).not.toHaveBeenCalled()
                done()
            }, 100)
        })

        it('emits error with connection', async (done) => {
            const client = createClient({
                restUrl: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.onError = jest.fn()
            client.once('error', (error) => {
                expect(error).toBeTruthy()
                expect(client.onError).toHaveBeenCalledTimes(1)
                done()
            })
            client.connect()
        })
    })

    it('can disconnect before connected', async () => {
        const client = createClient()
        client.onError = jest.fn()
        client.once('error', (error) => {
            expect(error).toMatchObject({
                message: 'Failed to send subscribe request: Error: WebSocket is not open: readyState 3 (CLOSED)',
            })

            expect(client.onError).toHaveBeenCalledTimes(1)
        })
        client.connect()
        await client.ensureDisconnected()
    })

    describe('resend', () => {
        let client
        let stream

        let timestamps = []

        beforeEach(async () => {
            client = createClient()
            await client.ensureConnected()

            stream = await client.createStream({
                name: uid('stream')
            })

            timestamps = []
            for (let i = 0; i < 5; i++) {
                const message = {
                    msg: `message${i}`,
                }

                // eslint-disable-next-line no-await-in-loop
                const rawMessage = await client.publish(stream.id, message)
                timestamps.push(rawMessage.streamMessage.getTimestamp())
                // eslint-disable-next-line no-await-in-loop
                await wait(100) // ensure timestamp increments for reliable resend response in test.
            }

            await wait(5000) // wait for messages to (probably) land in storage
        }, 10 * 1000)

        afterEach(async () => {
            await client.ensureDisconnected()
        })

        it('resend last', async () => {
            const messages = []

            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 3,
                },
            }, (message) => {
                messages.push(message)
            })

            await waitForEvent(sub, 'resent')
            expect(messages).toHaveLength(3)
            expect(messages).toEqual([{
                msg: 'message2',
            }, {
                msg: 'message3',
            }, {
                msg: 'message4',
            }])
        }, 15000)

        it('resend from', async () => {
            const messages = []

            const sub = await client.resend(
                {
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[3],
                        },
                    },
                },
                (message) => {
                    messages.push(message)
                },
            )

            await waitForEvent(sub, 'resent')
            expect(messages).toEqual([
                {
                    msg: 'message3',
                },
                {
                    msg: 'message4',
                },
            ])
        }, 10000)

        it('resend range', async () => {
            const messages = []

            const sub = await client.resend(
                {
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[0],
                        },
                        to: {
                            timestamp: timestamps[3] - 1,
                        },
                    },
                },
                (message) => {
                    messages.push(message)
                },
            )

            await waitForEvent(sub, 'resent')
            expect(messages).toEqual([
                {
                    msg: 'message0',
                },
                {
                    msg: 'message1',
                },
                {
                    msg: 'message2',
                },
            ])
        }, 10000)
    })

    describe('ensureConnected', () => {
        it('connects the client', async () => {
            const client = createClient()
            await client.ensureConnected()
            expect(client.isConnected()).toBeTruthy()
            // no error if already connected
            await client.ensureConnected()
            expect(client.isConnected()).toBeTruthy()
            await client.disconnect()
        })

        it('does not error if connecting', async (done) => {
            const client = createClient()
            client.connection.once('connecting', async () => {
                await client.ensureConnected()
                expect(client.isConnected()).toBeTruthy()
                await client.disconnect()
                done()
            })

            await client.connect()
        })

        it('connects if disconnecting', async (done) => {
            const client = createClient()
            client.connection.once('disconnecting', async () => {
                await client.ensureConnected()
                expect(client.isConnected()).toBeTruthy()
                await client.disconnect()
                done()
            })

            await client.connect()
            await client.disconnect()
        })
    })

    describe('ensureDisconnected', () => {
        it('disconnects the client', async () => {
            const client = createClient()
            // no error if already disconnected
            await client.ensureDisconnected()
            await client.connect()
            await client.ensureDisconnected()
            expect(client.isDisconnected()).toBeTruthy()
        })

        it('does not error if disconnecting', async (done) => {
            const client = createClient()
            client.connection.once('disconnecting', async () => {
                await client.ensureDisconnected()
                expect(client.isDisconnected()).toBeTruthy()
                done()
            })
            await client.connect()
            await client.disconnect()
        })

        it('disconnects if connecting', async (done) => {
            const client = createClient()
            client.connection.once('connecting', async () => {
                await client.ensureDisconnected()
                expect(client.isDisconnected()).toBeTruthy()
                done()
            })
            await client.connect()
        })

        it('clear _reconnectTimeout when disconnecting client', async (done) => {
            const client = createClient()
            await client.ensureConnected()

            client.once('disconnected', async () => {
                await client.ensureDisconnected()
                setTimeout(() => {
                    expect(client.isDisconnected()).toBeTruthy()
                    done()
                }, 2500)
            })

            client.connection.socket.close()
        })
    })

    describe('connect during disconnect', () => {
        let client
        async function teardown() {
            if (client) {
                client.removeAllListeners('error')
                await client.ensureDisconnected()
            }
        }

        beforeEach(async () => {
            await teardown()
        })

        afterEach(async () => {
            await teardown()
        })

        it('can reconnect after disconnect', (done) => {
            client = createClient()
            client.once('error', done)
            client.connect()
            client.once('connected', async () => {
                await client.disconnect()
            })
            client.once('disconnected', () => {
                client.connect()
                client.once('connected', async () => {
                    await client.disconnect()
                    done()
                })
            })
        })

        it('can disconnect before connected', async (done) => {
            client = createClient()
            client.once('error', done)
            client.connect()
            await client.disconnect()
            done()
        })

        it('can connect', async (done) => {
            client = createClient()
            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
                await client.disconnect()
                done()
            })

            await client.disconnect()
        }, 5000)

        it('will resolve original disconnect', async (done) => {
            client = createClient()

            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
            })
            await client.disconnect()
            done() // ok if it ever gets here
        }, 5000)

        it('has connection state transitions in correct order', async (done) => {
            client = createClient()
            const connectionEventSpy = jest.spyOn(client.connection, 'emit')

            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
                const eventNames = connectionEventSpy.mock.calls.map(([eventName]) => eventName)
                expect(eventNames).toEqual([
                    'connecting',
                    'connected',
                    'disconnecting',
                    'disconnected', // should disconnect before re-connecting
                    'connecting',
                    'connected',
                ])
                done()
            })
            await client.disconnect()
        }, 5000)

        it('should not subscribe to unsubscribed streams on reconnect', async (done) => {
            client = createClient()
            await client.ensureConnected()
            const sessionToken = await client.session.getSessionToken()

            const stream = await client.createStream({
                name: uid('stream')
            })

            const connectionEventSpy = jest.spyOn(client.connection, 'send')
            const sub = client.subscribe(stream.id, () => {})

            sub.once('subscribed', async () => {
                await wait(100)
                client.unsubscribe(sub)
            })

            sub.once('unsubscribed', async () => {
                await client.ensureDisconnected()
                await client.ensureConnected()
                await client.ensureDisconnected()

                // check whole list of calls after reconnect and disconnect
                expect(connectionEventSpy.mock.calls[0]).toEqual([new SubscribeRequest({
                    streamId: stream.id,
                    streamPartition: 0,
                    sessionToken,
                    requestId: connectionEventSpy.mock.calls[0][0].requestId,
                })])

                expect(connectionEventSpy.mock.calls[1]).toEqual([new UnsubscribeRequest({
                    streamId: stream.id,
                    streamPartition: 0,
                    sessionToken,
                    requestId: connectionEventSpy.mock.calls[1][0].requestId,
                })])

                // key exchange stream subscription should not have been sent yet
                expect(connectionEventSpy.mock.calls.length).toEqual(2)
                done()
            })
        })

        it('should not subscribe after resend() on reconnect', async (done) => {
            client = createClient()
            await client.ensureConnected()
            const sessionToken = await client.session.getSessionToken()

            const stream = await client.createStream({
                name: uid('stream')
            })

            const connectionEventSpy = jest.spyOn(client.connection, 'send')
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 10
                }
            }, () => {})

            sub.once('initial_resend_done', () => {
                setTimeout(async () => {
                    await client.pause() // simulates a disconnection at the websocket level, not on the client level.
                    await client.ensureConnected()
                    await client.ensureDisconnected()

                    // check whole list of calls after reconnect and disconnect
                    expect(connectionEventSpy.mock.calls[0]).toEqual([new ResendLastRequest({
                        streamId: stream.id,
                        streamPartition: 0,
                        sessionToken,
                        numberLast: 10,
                        requestId: connectionEventSpy.mock.calls[0][0].requestId,
                    })])

                    // key exchange stream subscription should not have been sent yet
                    expect(connectionEventSpy.mock.calls.length).toEqual(1)
                    done()
                }, 2000)
            })
        }, 5000)

        it('does not try to reconnect', async (done) => {
            client = createClient()
            client.once('error', done)
            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()

                // should not try connecting after disconnect (or any other reason)
                const onConnecting = () => {
                    done(new Error('should not be connecting'))
                }
                client.once('connecting', onConnecting)

                await client.disconnect()
                // wait for possible reconnections
                setTimeout(() => {
                    client.off('connecting', onConnecting)
                    expect(client.isConnected()).toBe(false)
                    done()
                }, 2000)
            })
            await client.disconnect()
        }, 6000)
    })

    describe('publish/subscribe connection handling', () => {
        let client
        async function teardown() {
            if (!client) { return }
            client.removeAllListeners('error')
            await client.ensureDisconnected()
            client = undefined
        }

        beforeEach(async () => {
            await teardown()
        })

        afterEach(async () => {
            await teardown()
        })

        describe('publish', () => {
            it('will connect if not connected if autoconnect set', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.once('error', done)

                const stream = await client.createStream({
                    name: uid('stream')
                })
                await client.ensureDisconnected()

                const message = {
                    id2: uid('msg')
                }
                client.once('connected', () => {
                    // wait in case of delayed errors
                    setTimeout(() => done(), 500)
                })
                await client.publish(stream.id, message)
            })

            it('will connect if disconnecting & autoconnect set', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uid('stream')
                })

                const message = {
                    id1: uid('msg')
                }
                const p = client.publish(stream.id, message)
                setTimeout(async () => {
                    await client.disconnect() // start async disconnect after publish started
                })
                await p
                // wait in case of delayed errors
                setTimeout(() => done(), 500)
            })

            it('will error if disconnecting & autoconnect not set', async (done) => {
                client = createClient({
                    autoConnect: false,
                    autoDisconnect: false,
                })

                client.onError = jest.fn()
                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uid('stream')
                })

                const message = {
                    id1: uid('msg')
                }

                client.publish(stream.id, message).catch((err) => {
                    expect(err).toBeTruthy()
                    setTimeout(() => {
                        // wait in case of delayed errors
                        expect(client.onError).not.toHaveBeenCalled()
                        done()
                    })
                }) // don't wait

                setTimeout(() => {
                    client.disconnect() // start async disconnect after publish started
                })
            })
        })
        describe('subscribe', () => {
            it('does not error if disconnect after subscribe', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.onError = jest.fn()
                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uid('stream')
                })

                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, () => {})
                sub.once('subscribed', async () => {
                    await client.disconnect()
                    // wait in case of delayed errors
                    setTimeout(() => {
                        expect(client.onError).not.toHaveBeenCalled()
                        done()
                    }, 100)
                })
            })
        })
    })
})

describe('StreamrClient', () => {
    let client
    let stream

    // These tests will take time, especially on Travis
    const TIMEOUT = 5 * 1000

    const createStream = async () => {
        const name = `StreamrClient-integration-${Date.now()}`
        assert(client.isConnected())

        const s = await client.createStream({
            name,
            requireSignedData: true,
        })

        assert(s.id)
        assert.equal(s.name, name)
        assert.strictEqual(s.requireSignedData, true)
        return s
    }

    beforeEach(async () => {
        client = createClient()
        // create client before connecting ws
        // so client generates correct options.url for us

        try {
            await Promise.all([
                fetch(config.clientOptions.restUrl),
                new Promise((resolve, reject) => {
                    const ws = new WebSocket(client.options.url)
                    ws.once('open', () => {
                        resolve()
                        ws.close()
                    })
                    ws.once('error', (err) => {
                        reject(err)
                        ws.terminate()
                    })
                }),
            ])
        } catch (e) {
            if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                throw new Error('Integration testing requires that engine-and-editor '
                    + 'and data-api ("entire stack") are running in the background. '
                    + 'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
            } else {
                throw e
            }
        }
        await client.ensureConnected()
        stream = await createStream()
        const publisherId = await client.getPublisherId()
        const res = await client.isStreamPublisher(stream.id, publisherId.toLowerCase())
        assert.strictEqual(res, true)
    })

    afterEach(async () => {
        if (client) {
            client.removeAllListeners('error')
            await client.ensureDisconnected()
        }
    })

    describe('Pub/Sub', () => {
        it('client.publish', async (done) => {
            client.once('error', done)
            await client.publish(stream.id, {
                test: 'client.publish',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('Stream.publish', async (done) => {
            client.once('error', done)
            await stream.publish({
                test: 'Stream.publish',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.publish with Stream object as arg', async (done) => {
            client.once('error', done)
            await client.publish(stream, {
                test: 'client.publish.Stream.object',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe with resend from', (done) => {
            client.once('error', done)
            // Publish message
            client.publish(stream.id, {
                test: 'client.subscribe with resend',
            })

            // Check that we're not subscribed yet
            assert.strictEqual(client.getSubscriptions()[stream.id], undefined)

            // Add delay: this test needs some time to allow the message to be written to Cassandra
            setTimeout(() => {
                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    assert.strictEqual(parsedContent.test, 'client.subscribe with resend')

                    // Check signature stuff
                    // WARNING: digging into internals
                    const subStream = client._getSubscribedStreamPartition(stream.id, 0) // eslint-disable-line no-underscore-dangle
                    const publishers = await subStream.getPublishers()
                    const map = {}
                    map[client.signer.address.toLowerCase()] = true
                    assert.deepStrictEqual(publishers, map)
                    assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                    assert(streamMessage.getPublisherId())
                    assert(streamMessage.signature)

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.once('unsubscribed', () => {
                        assert.strictEqual(client.getSubscriptions(stream.id).length, 0)
                        done()
                    })
                })
            }, TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe with resend last', (done) => {
            client.once('error', done)
            // Publish message
            client.publish(stream.id, {
                test: 'client.subscribe with resend',
            })

            // Check that we're not subscribed yet
            assert.strictEqual(client.getSubscriptions(stream.id).length, 0)

            // Add delay: this test needs some time to allow the message to be written to Cassandra
            setTimeout(() => {
                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1,
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    assert.strictEqual(parsedContent.test, 'client.subscribe with resend')

                    // Check signature stuff
                    // WARNING: digging into internals
                    const subStream = client._getSubscribedStreamPartition(stream.id, 0) // eslint-disable-line no-underscore-dangle
                    const publishers = await subStream.getPublishers()
                    const map = {}
                    map[client.signer.address.toLowerCase()] = true
                    assert.deepStrictEqual(publishers, map)
                    assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                    assert(streamMessage.getPublisherId())
                    assert(streamMessage.signature)

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.once('unsubscribed', () => {
                        assert.strictEqual(client.getSubscriptions(stream.id).length, 0)
                        done()
                    })
                })
            }, TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe (realtime)', (done) => {
            client.once('error', done)
            const id = Date.now()
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                // All good, unsubscribe
                client.unsubscribe(sub)
                sub.once('unsubscribed', () => {
                    done()
                })
            })

            // Publish after subscribed
            sub.once('subscribed', () => {
                stream.publish({
                    id,
                })
            })
        })

        it('publish and subscribe a sequence of messages', (done) => {
            client.options.autoConnect = true
            const nbMessages = 20
            const intervalMs = 500
            let counter = 1
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent, streamMessage) => {
                assert.strictEqual(parsedContent.i, counter)
                counter += 1

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                if (counter === nbMessages) {
                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.once('unsubscribed', async () => {
                        await client.disconnect()
                        setTimeout(done, 1000)
                    })
                }
            })

            const sleep = (ms) => {
                return new Promise((resolve) => setTimeout(resolve, ms))
            }
            const f = async (index) => {
                await sleep(intervalMs)
                await stream.publish({
                    i: index,
                })
            }

            // Publish after subscribed
            sub.once('subscribed', () => {
                let i
                const loop = async () => {
                    for (i = 1; i <= nbMessages; i++) {
                        await f(i) // eslint-disable-line no-await-in-loop
                    }
                }
                return loop()
            })
        }, 20000)

        it('client.subscribe (realtime with resend)', (done) => {
            client.once('error', done)

            const id = Date.now()
            const sub = client.subscribe({
                stream: stream.id,
                resend: {
                    last: 1,
                },
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                sub.once('unsubscribed', () => {
                    done()
                })
                // All good, unsubscribe
                client.unsubscribe(sub)
            })

            // Publish after subscribed
            sub.once('subscribed', () => {
                stream.publish({
                    id,
                })
            })
        }, 30000)

        it('client.subscribe can decrypt encrypted messages if it knows the group key', async (done) => {
            client.once('error', done)
            const id = Date.now()
            const publisherId = await client.getPublisherId()
            const groupKey = crypto.randomBytes(32)
            const keys = {}
            keys[publisherId] = groupKey
            const sub = client.subscribe({
                stream: stream.id,
                groupKeys: keys,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                // All good, unsubscribe
                client.unsubscribe(sub)
                sub.once('unsubscribed', () => {
                    done()
                })
            })

            // Publish after subscribed
            sub.once('subscribed', () => {
                client.publish(stream.id, {
                    id,
                }, Date.now(), null, groupKey)
            })
        })

        it('client.subscribe can get the group key and decrypt encrypted messages using an RSA key pair', async (done) => {
            client.once('error', done)
            const id = Date.now()
            const groupKey = crypto.randomBytes(32)
            // subscribe without knowing the group key to decrypt stream messages
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                // Now the subscriber knows the group key
                assert.deepStrictEqual(sub.groupKeys[streamMessage.getPublisherId().toLowerCase()], groupKey)

                sub.once('unsubscribed', () => {
                    done()
                })

                // All good, unsubscribe
                client.unsubscribe(sub)
            })

            // Publish after subscribed
            sub.once('subscribed', () => {
                client.publish(stream.id, {
                    id,
                }, Date.now(), null, groupKey)
            })
        }, 2 * TIMEOUT)

        it('client.subscribe with resend last can get the historical keys for previous encrypted messages', (done) => {
            client.once('error', done)
            // Publish encrypted messages with different keys
            const groupKey1 = crypto.randomBytes(32)
            const groupKey2 = crypto.randomBytes(32)
            client.publish(stream.id, {
                test: 'resent msg 1',
            }, Date.now(), null, groupKey1)
            client.publish(stream.id, {
                test: 'resent msg 2',
            }, Date.now(), null, groupKey2)

            // Add delay: this test needs some time to allow the message to be written to Cassandra
            let receivedFirst = false
            setTimeout(() => {
                // subscribe with resend without knowing the historical keys
                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2,
                    },
                }, async (parsedContent) => {
                    // Check message content
                    if (!receivedFirst) {
                        assert.strictEqual(parsedContent.test, 'resent msg 1')
                        receivedFirst = true
                    } else {
                        assert.strictEqual(parsedContent.test, 'resent msg 2')
                    }

                    sub.once('unsubscribed', () => {
                        // TODO: fix this hack in other PR
                        assert.strictEqual(client.subscribedStreamPartitions[stream.id + '0'], undefined)
                        done()
                    })

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                })
            }, TIMEOUT * 0.8)
        }, 2 * TIMEOUT)
    })

    describe('utf-8 encoding', () => {
        const publishedMessage = {
            content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
        }

        it('decodes realtime messages correctly', async (done) => {
            client.once('error', done)
            const sub = client.subscribe(stream.id, (msg) => {
                expect(msg).toStrictEqual(publishedMessage)
                done()
            }).once('subscribed', () => {
                client.publish(stream.id, publishedMessage)
            })
        })

        it('decodes resent messages correctly', async (done) => {
            client.once('error', done)
            await client.publish(stream.id, publishedMessage)
            await wait(5000)
            await client.resend({
                stream: stream.id,
                resend: {
                    last: 3,
                },
            }, (msg) => {
                expect(msg).toStrictEqual(publishedMessage)
                done()
            })
        }, 10000)
    })
})
