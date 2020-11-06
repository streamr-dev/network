import fs from 'fs'
import path from 'path'
import Debug from 'debug'

import fetch from 'node-fetch'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { wait, waitForEvent } from 'streamr-test-utils'

import { uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, Msg } from '../utils'
import StreamrClient from '../../src'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'

const { StreamMessage } = MessageLayer
const WebSocket = require('ws')
const { SubscribeRequest, UnsubscribeRequest, ResendLastRequest } = ControlLayer

console.log = Debug('Streamr::   CONSOLE   ')

describe('StreamrClient', () => {
    let expectErrors = 0 // check no errors by default
    let errors = []

    const getOnError = (errs) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...config.clientOptions,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    async function checkConnection() {
        const c = createClient()
        // create a temp client before connecting ws
        // so client generates correct options.url for us
        try {
            await Promise.all([
                Promise.race([
                    fetch(c.options.restUrl),
                    wait(1000).then(() => {
                        throw new Error(`timed out connecting to: ${c.options.restUrl}`)
                    })
                ]),
                Promise.race([
                    new Promise((resolve, reject) => {
                        const ws = new WebSocket(c.options.url)
                        ws.once('open', () => {
                            c.debug('open', c.options.url)
                            resolve()
                            ws.close()
                        })
                        ws.once('error', (err) => {
                            c.debug('err', c.options.url, err)
                            reject(err)
                            ws.terminate()
                        })
                    }),
                    wait(1000).then(() => {
                        throw new Error(`timed out connecting to: ${c.options.url}`)
                    })
                ]),
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
    }

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    beforeAll(async () => {
        await checkConnection()
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('Connection', () => {
        describe('bad config.url', () => {
            it('emits error without autoconnect', async () => {
                expectErrors = 1
                client = createClient({
                    url: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })

                await expect(() => (
                    client.connect()
                )).rejects.toThrow()
            })

            it('rejects on connect without autoconnect', async () => {
                expectErrors = 1
                client = createClient({
                    url: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })

                await expect(() => (
                    client.connect()
                )).rejects.toThrow()
            })

            it('emits error with autoconnect after first call that triggers connect()', async () => {
                expectErrors = 1

                client = createClient({
                    url: 'asdasd',
                    autoConnect: true,
                    autoDisconnect: true,
                })
                const client2 = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                const otherOnError = jest.fn()
                client2.on('error', otherOnError)

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
                expect(otherOnError).toHaveBeenCalledTimes(0)
            }, 10000)
        })

        describe('bad config.restUrl', () => {
            it('emits no error with no connection', async (done) => {
                client = createClient({
                    restUrl: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })
                setTimeout(() => {
                    expect(client.onError).not.toHaveBeenCalled()
                    done()
                }, 100)
            })

            it('does not emit error with connect', async (done) => {
                // error will come through when getting session
                client = createClient({
                    restUrl: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })
                await client.connect()
                setTimeout(() => {
                    expect(client.onError).not.toHaveBeenCalled()
                    done()
                }, 100)
            })
        })

        describe('connect handling', () => {
            it('connects the client', async () => {
                client = createClient()
                await client.connect()
                expect(client.isConnected()).toBeTruthy()
                // no error if already connected
                await client.connect()
                expect(client.isConnected()).toBeTruthy()
                await client.disconnect()
            })

            it('does not error if connecting', async (done) => {
                client = createClient()
                client.connection.once('connecting', async () => {
                    await client.connect()
                    expect(client.isConnected()).toBeTruthy()
                    done()
                })

                await client.connect()
                expect(client.isConnected()).toBeTruthy()
            })

            it('connects if disconnecting', async (done) => {
                expectErrors = 1
                client = createClient()
                client.connection.once('disconnecting', async () => {
                    await client.connect()
                    expect(client.isConnected()).toBeTruthy()
                    await client.disconnect()
                    done()
                })

                await client.connect()
                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
            })
        })

        describe('disconnect handling', () => {
            it('disconnects the client', async () => {
                client = createClient()
                // no error if already disconnected
                await client.disconnect()
                await client.connect()
                await client.disconnect()
                expect(client.isDisconnected()).toBeTruthy()
            })

            it('does not error if disconnecting', async (done) => {
                client = createClient()
                client.connection.once('disconnecting', async () => {
                    await client.disconnect()
                    expect(client.isDisconnected()).toBeTruthy()
                    done()
                })
                await client.connect()
                await client.disconnect()
            })

            it('disconnects if connecting', async (done) => {
                expectErrors = 1
                client = createClient()
                client.connection.once('connecting', async () => {
                    await client.disconnect()
                    expect(client.isDisconnected()).toBeTruthy()
                    done()
                })
                await expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
            })

            it('clear _reconnectTimeout when disconnecting client', async (done) => {
                client = createClient()
                await client.connect()

                client.once('disconnected', async () => {
                    await client.disconnect()
                    setTimeout(() => {
                        expect(client.isDisconnected()).toBeTruthy()
                        done()
                    }, 2500)
                })

                client.connection.socket.close()
            })
        })

        describe('connect during disconnect', () => {
            it('can reconnect after disconnect', async (done) => {
                expectErrors = 3
                client = createClient()
                client.once('connected', async () => {
                    await expect(async () => {
                        await client.disconnect()
                    }).rejects.toThrow()
                })
                client.once('disconnected', async () => {
                    client.once('connected', async () => {
                        await client.disconnect()
                        done()
                    })

                    await expect(async () => {
                        await client.connect()
                    }).rejects.toThrow()
                })
                await expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
            })

            it('can disconnect before connected', async () => {
                expectErrors = 1
                client = createClient()

                const t = expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await client.disconnect()
                await t
            })

            it('can disconnect before connected', async () => {
                expectErrors = 1
                client = createClient()
                const t = expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await client.disconnect()
                await t
                expect(client.onError).toHaveBeenCalledTimes(1)
            })

            it('can connect', async (done) => {
                expectErrors = 1
                client = createClient()
                await client.connect()

                client.connection.once('disconnecting', async () => {
                    await client.connect()
                    await client.disconnect()
                    done()
                })

                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
            }, 5000)

            it('will resolve original disconnect', async () => {
                expectErrors = 1
                client = createClient()

                await client.connect()

                client.connection.once('disconnecting', async () => {
                    await client.connect()
                })
                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
            }, 5000)

            it('has connection state transitions in correct order', async (done) => {
                expectErrors = 1
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
                        'error',
                    ])
                    expect(client.isConnected()).toBeTruthy()
                    done()
                })

                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
            }, 5000)

            it('should not subscribe to unsubscribed streams on reconnect', async () => {
                client = createClient()
                await client.connect()
                const sessionToken = await client.session.getSessionToken()

                const stream = await client.createStream({
                    name: uid('stream')
                })

                const connectionEventSpy = jest.spyOn(client.connection, '_send')
                const sub = await client.subscribe(stream.id, () => {})
                await wait(100)
                await client.unsubscribe(sub)
                await client.disconnect()
                await client.connect()
                await client.disconnect()
                // key exchange stream subscription should not have been sent yet
                expect(connectionEventSpy.mock.calls).toHaveLength(2)

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
            })

            it('should not subscribe after resend() on reconnect', async () => {
                client = createClient()
                await client.connect()
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
                })

                const msgs = await sub.collect()

                await wait(2000)
                await client.pause() // simulates a disconnection at the websocket level, not on the client level.
                await client.connect()
                await client.disconnect()

                // check whole list of calls after reconnect and disconnect
                expect(connectionEventSpy.mock.calls[0]).toEqual([new ResendLastRequest({
                    streamId: stream.id,
                    streamPartition: 0,
                    sessionToken,
                    numberLast: 10,
                    requestId: connectionEventSpy.mock.calls[0][0].requestId,
                })])
                expect(msgs).toEqual([])

                // key exchange stream subscription should not have been sent yet
                expect(connectionEventSpy.mock.calls.length).toEqual(1)
            }, 5000)

            it('does not try to reconnect', async (done) => {
                expectErrors = 1
                client = createClient()
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
                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
            }, 6000)
        })

        describe('publish/subscribe connection handling', () => {
            describe('publish', () => {
                it('will connect if not connected if autoconnect set', async (done) => {
                    client = createClient({
                        autoConnect: true,
                        autoDisconnect: true,
                    })

                    const stream = await client.createStream({
                        name: uid('stream')
                    })
                    expect(client.isDisconnected()).toBeTruthy()

                    const message = {
                        id2: uid('msg')
                    }

                    client.once('connected', () => {
                        // wait in case of delayed errors
                        setTimeout(() => done(), 500)
                    })
                    await client.publish(stream.id, message)
                })

                it('errors if disconnected autoconnect set', async (done) => {
                    expectErrors = 0 // publish error doesn't cause error events
                    client = createClient({
                        autoConnect: true,
                        autoDisconnect: true,
                    })

                    await client.connect()
                    const stream = await client.createStream({
                        name: uid('stream')
                    })

                    const message = {
                        id1: uid('msg')
                    }
                    const p = client.publish(stream.id, message)
                    await wait()
                    await client.disconnect() // start async disconnect after publish started
                    await expect(p).rejects.toThrow()
                    expect(client.isDisconnected()).toBeTruthy()
                    // wait in case of delayed errors
                    setTimeout(() => done(), 500)
                })

                it('errors if disconnected autoconnect not set', async (done) => {
                    expectErrors = 0
                    client = createClient({
                        autoConnect: false,
                        autoDisconnect: true,
                    })

                    await client.connect()
                    const stream = await client.createStream({
                        name: uid('stream')
                    })

                    const message = {
                        id1: uid('msg')
                    }
                    const p = client.publish(stream.id, message)
                    await wait()
                    await client.disconnect() // start async disconnect after publish started
                    await expect(p).rejects.toThrow()
                    expect(client.isDisconnected()).toBeTruthy()
                    // wait in case of delayed errors
                    setTimeout(() => done(), 500)
                }, 10000)
            })

            describe('subscribe', () => {
                it('does not error if disconnect after subscribe', async (done) => {
                    client = createClient({
                        autoConnect: true,
                        autoDisconnect: true,
                    })

                    await client.connect()
                    const stream = await client.createStream({
                        name: uid('stream')
                    })

                    await client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    await client.disconnect()
                    // wait in case of delayed errors
                    setTimeout(() => {
                        expect(client.onError).not.toHaveBeenCalled()
                        done()
                    }, 100)
                })

                it('does not error if disconnect after subscribe with resend', async (done) => {
                    client = createClient({
                        autoConnect: true,
                        autoDisconnect: true,
                    })

                    await client.connect()
                    const stream = await client.createStream({
                        name: uid('stream')
                    })

                    await client.subscribe({
                        stream: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, () => {})

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

    describe('StreamrClient', () => {
        let stream
        let waitForStorage
        let publishTestMessages

        // These tests will take time, especially on Travis
        const TIMEOUT = 5 * 1000

        const attachSubListeners = (sub) => {
            const onSubscribed = jest.fn()
            sub.on('subscribed', onSubscribed)
            const onResent = jest.fn()
            sub.on('resent', onResent)
            const onUnsubscribed = jest.fn()
            sub.on('unsubscribed', onUnsubscribed)
            const onMessage = jest.fn()
            sub.on('message', onMessage)
            return {
                onSubscribed,
                onUnsubscribed,
                onResent,
                onMessage,
            }
        }

        const createStream = async ({ requireSignedData = true, ...opts } = {}) => {
            const name = uid('stream')
            const s = await client.createStream({
                name,
                requireSignedData,
                ...opts,
            })

            expect(s.id).toBeTruthy()
            expect(s.name).toEqual(name)
            expect(s.requireSignedData).toBe(requireSignedData)
            return s
        }

        beforeEach(async () => {
            client = createClient()
            await Promise.all([
                client.session.getSessionToken(),
                client.connect(),
            ])
            stream = await createStream()
            publishTestMessages = getPublishTestMessages(client, {
                stream,
            })
            waitForStorage = getWaitForStorage(client, {
                stream,
            })
            expect(onError).toHaveBeenCalledTimes(0)
        })

        afterEach(async () => {
            await wait()
            // ensure no unexpected errors
            expect(onError).toHaveBeenCalledTimes(expectErrors)
        })

        afterEach(async () => {
            await wait()

            if (client) {
                client.debug('disconnecting after test')
                await client.disconnect()
            }

            const openSockets = Connection.getOpen()
            if (openSockets !== 0) {
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        it('is stream publisher', async () => {
            const publisherId = await client.getPublisherId()
            const res = await client.isStreamPublisher(stream.id, publisherId)
            expect(res).toBe(true)
        })

        describe.only('Pub/Sub', () => {
            it('client.publish does not error', async (done) => {
                await client.publish(stream.id, {
                    test: 'client.publish',
                })
                setTimeout(() => done(), TIMEOUT * 0.2)
            }, TIMEOUT)

            it('Stream.publish does not error', async (done) => {
                await stream.publish({
                    test: 'Stream.publish',
                })
                setTimeout(() => done(), TIMEOUT * 0.2)
            }, TIMEOUT)

            it('client.publish with Stream object as arg', async (done) => {
                await client.publish(stream, {
                    test: 'client.publish.Stream.object',
                })
                setTimeout(() => done(), TIMEOUT * 0.2)
            }, TIMEOUT)

            describe('subscribe/unsubscribe', () => {
                beforeEach(() => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                })

                it('client.subscribe then unsubscribe after subscribed without resend', async () => {
                    const sub = await client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    const events = attachSubListeners(sub)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1) // has subscription immediately
                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    await client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed without resend', async () => {
                    const sub = await client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    const events = attachSubListeners(sub)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const t = client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await t
                    await wait(TIMEOUT * 0.2)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                describe('with resend', () => {
                    it('client.subscribe then unsubscribe before subscribed', async () => {
                        const sub = await client.subscribe({
                            stream: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, () => {})

                        const events = attachSubListeners(sub)
                        expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                        const t = client.unsubscribe(sub)
                        expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                        await t
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        await wait(TIMEOUT * 0.2)
                    }, TIMEOUT)

                    it('client.subscribe then unsubscribe before subscribed', async () => {
                        const sub = await client.subscribe({
                            stream: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, () => {})

                        expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                        const events = attachSubListeners(sub)
                        const t = client.unsubscribe(sub)
                        expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                        await t
                        await wait(TIMEOUT * 0.2)
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                    }, TIMEOUT)

                    it('client.subscribe then unsubscribe ignores messages with resend', async () => {
                        const msg = Msg()
                        await stream.publish(msg)
                        await waitForStorage(msg)

                        const onMessage = jest.fn()
                        const sub = await client.subscribe({
                            stream: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, onMessage)

                        expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                        const events = attachSubListeners(sub)
                        await client.unsubscribe(sub)
                        expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        expect(events.onMessage).toHaveBeenCalledTimes(0)
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                    }, TIMEOUT)
                })

                it('client.subscribe then unsubscribe ignores messages', async () => {
                    const onMessage = jest.fn()
                    const sub = await client.subscribe({
                        stream: stream.id,
                    }, onMessage)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const events = attachSubListeners(sub)
                    const t = client.unsubscribe(sub)
                    await stream.publish(Msg())
                    await t
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await wait(TIMEOUT * 0.2)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onMessage).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)
            })

            it('client.subscribe (realtime)', async (done) => {
                const id = Date.now()
                const sub = await client.subscribe({
                    stream: stream.id,
                }, async (parsedContent, streamMessage) => {
                    expect(parsedContent.id).toBe(id)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    await client.unsubscribe(sub)
                    done()
                })

                // Publish after subscribed
                await stream.publish({
                    id,
                })
            })

            it('publish and subscribe a sequence of messages', async () => {
                client.options.autoConnect = true
                const done = Defer()
                const nbMessages = 3
                const intervalMs = 100
                const received = []
                const sub = await client.subscribe({
                    stream: stream.id,
                }, async (parsedContent, streamMessage) => {
                    received.push(parsedContent)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                    if (received.length === nbMessages) {
                        // All good, unsubscribe
                        await client.unsubscribe(sub)
                        await client.disconnect()
                        done.resolve()
                    }
                })

                // Publish after subscribed
                const published = await publishTestMessages(nbMessages, {
                    wait: intervalMs,
                })

                await done
                expect(received).toEqual(published)
            })

            it('client.subscribe with resend from', async () => {
                const done = Defer()
                // Publish message
                const msg = Msg()
                await client.publish(stream.id, msg)

                // Check that we're not subscribed yet
                expect(client.getSubscriptions()[stream.id]).toBe(undefined)

                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, done.wrap(async (parsedContent, streamMessage) => {
                    // Check message content
                    expect(parsedContent).toEqual(msg)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    await client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                }))

                await done
            }, TIMEOUT)

            it('client.subscribe with resend last', async () => {
                const done = Defer()
                // Publish message
                const msg = Msg()
                await client.publish(stream.id, msg)

                // Check that we're not subscribed yet
                expect(client.getSubscriptions()[stream.id]).toBe(undefined)

                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1
                    },
                }, done.wrap(async (parsedContent, streamMessage) => {
                    // Check message content
                    expect(parsedContent).toEqual(msg)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    await client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                }))

                await done
            }, TIMEOUT)

            it('client.subscribe (realtime with resend)', async () => {
                const msg = Msg()
                const done = Defer()
                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1,
                    },
                }, done.wrap(async (parsedContent, streamMessage) => {
                    expect(parsedContent).toEqual(msg)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    await client.unsubscribe(sub)
                }))

                // Publish after subscribed
                await stream.publish(msg)
                await done
            }, TIMEOUT)
        })

        describe('resend', () => {
            let timestamps = []
            let published = []

            beforeEach(async () => {
                publishTestMessages = getPublishTestMessages(client, {
                    stream,
                    waitForLast: true,
                })
            })

            beforeEach(async () => {
                const publishedRaw = await publishTestMessages.raw(5)
                timestamps = publishedRaw.map(([, raw]) => raw.streamMessage.getTimestamp())
                published = publishedRaw.map(([msg]) => msg)
            }, 10 * 1000)

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
                expect(messages).toEqual(published)
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
                expect(messages).toEqual(messages.slice(3))
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
                expect(messages).toEqual(published.slice(0, 3))
            }, 10000)
        })

        describe('utf-8 encoding', () => {
            const publishedMessage = {
                content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
            }

            it('decodes realtime messages correctly', async (done) => {
                client.once('error', done)
                await client.subscribe(stream.id, (msg) => {
                    expect(msg).toStrictEqual(publishedMessage)
                    done()
                })
                await client.publish(stream.id, publishedMessage)
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
})
