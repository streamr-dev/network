import fs from 'fs'
import path from 'path'

import fetch from 'node-fetch'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { wait, waitForEvent } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, Msg } from '../utils'
import StreamrClient from '../../src'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'

const WebSocket = require('ws')

const { StreamMessage } = MessageLayer
const { SubscribeRequest, UnsubscribeRequest, ResendLastRequest, ControlMessage } = ControlLayer

const MAX_MESSAGES = 5

describeRepeats('StreamrClient', () => {
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
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
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
            it('emits no error with no connection', async () => {
                client = createClient({
                    restUrl: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })

                await wait(100)
            })

            it('does not emit error with connect', async () => {
                // error will come through when getting session
                client = createClient({
                    restUrl: 'asdasd',
                    autoConnect: false,
                    autoDisconnect: false,
                })
                await client.connect()
                await wait(100)
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

            it('does not error if connecting', async () => {
                client = createClient()
                const done = Defer()
                client.connection.once('connecting', done.wrap(async () => {
                    await client.connect()
                    expect(client.isConnected()).toBeTruthy()
                }))

                await client.connect()
                await done
                expect(client.isConnected()).toBeTruthy()
            })

            it('connects if disconnecting', async () => {
                const done = Defer()
                client = createClient()
                client.connection.once('disconnecting', done.wrap(async () => {
                    await client.connect()
                    expect(client.isConnected()).toBeTruthy()
                    await client.disconnect()
                }))

                await client.connect()
                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
                await done
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

            it('does not error if disconnecting', async () => {
                client = createClient()
                const done = Defer()
                client.connection.once('disconnecting', done.wrap(async () => {
                    await client.disconnect()
                    expect(client.isDisconnected()).toBeTruthy()
                }))
                await client.connect()
                await client.disconnect()
                await done
            })

            it('disconnects if connecting', async () => {
                const done = Defer()
                client = createClient()
                client.connection.once('connecting', done.wrap(async () => {
                    await client.disconnect()
                    expect(client.isDisconnected()).toBeTruthy()
                }))
                await expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await done
            })

            it('does not reconnect after purposeful disconnect', async () => {
                client = createClient()
                await client.connect()
                const done = Defer()

                client.once('disconnected', done.wrap(async () => {
                    await client.disconnect()
                }))

                client.connection.socket.close()
                await done
                await wait(2500)
                expect(client.isDisconnected()).toBeTruthy()
            })
        })

        describe('connect during disconnect', () => {
            it('can connect after disconnect', async () => {
                const done = Defer()
                client = createClient()
                client.once('connected', done.wrapError(async () => {
                    await expect(async () => {
                        await client.disconnect()
                    }).rejects.toThrow()
                }))
                client.once('disconnected', done.wrapError(async () => {
                    client.once('connected', done.wrapError(async () => {
                        await client.disconnect()
                        done.resolve()
                    }))

                    await expect(async () => {
                        await client.connect()
                    }).rejects.toThrow()
                }))
                await expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await done
            })

            it('can disconnect before connected', async () => {
                client = createClient()

                const t = expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await client.disconnect()
                await t
            })

            it('can disconnect before connected', async () => {
                client = createClient()
                const t = expect(async () => {
                    await client.connect()
                }).rejects.toThrow()
                await client.disconnect()
                await t
            })

            it('can connect', async () => {
                client = createClient()
                const done = Defer()
                await client.connect()

                client.connection.once('disconnecting', done.wrap(async () => {
                    await client.connect()
                    await client.disconnect()
                }))

                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
                await done
            })

            it('can reconnect on unexpected close', async () => {
                client = createClient()
                await client.connect()

                client.connection.socket.close()
                expect(client.isConnected()).not.toBeTruthy()
                await client.connection.nextConnection()
                expect(client.isConnected()).toBeTruthy()
            })

            it('will resolve original disconnect', async () => {
                const done = Defer()
                client = createClient()

                await client.connect()

                client.connection.once('disconnecting', done.wrap(async () => {
                    await client.connect()
                }))
                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
                await done
            })

            it('has connection state transitions in correct order', async () => {
                client = createClient()
                const done = Defer()
                const connectionEventSpy = jest.spyOn(client.connection, 'emit')

                await client.connect()

                client.connection.once('disconnecting', done.wrap(async () => {
                    await client.connect()
                    const eventNames = connectionEventSpy.mock.calls.map(([eventName]) => eventName)
                    expect(eventNames).toEqual([
                        'connecting',
                        'connected',
                        'disconnecting',
                    ])
                    expect(client.isConnected()).toBeTruthy()
                }))

                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
                await done
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
                await client.connection.socket.close()
                await client.connection.nextConnection()

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
                await client.disconnect()
            }, 5000)

            it('does not try to reconnect', async () => {
                client = createClient()
                await client.connect()

                const onConnectAfterDisconnecting = Defer()
                // should not try connecting after disconnect (or any other reason)
                client.connection.once('disconnecting', onConnectAfterDisconnecting.wrap(async () => {
                    await client.connect()
                }))

                await expect(async () => {
                    await client.disconnect()
                }).rejects.toThrow()
                await onConnectAfterDisconnecting
                expect(client.isConnected()).toBe(true)
                await client.disconnect()
                const onConnecting = jest.fn()
                client.once('connecting', onConnecting)
                // wait for possible reconnections
                await wait(2000)
                expect(onConnecting).toHaveBeenCalledTimes(0)
                expect(client.isConnected()).toBe(false)
            }, 6000)
        })

        describe('publish/subscribe connection handling', () => {
            describe('publish', () => {
                it('will connect if not connected if autoconnect set', async () => {
                    const done = Defer()
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

                    client.once('connected', done.wrap(() => {}))
                    await client.publish(stream.id, message)
                    await done
                    // wait in case of delayed errors
                    await wait(250)
                })

                it('errors if disconnected autoconnect set', async () => {
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
                    await wait(250)
                })

                it('errors if disconnected autoconnect not set', async () => {
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
                    await wait(500)
                }, 10000)
            })

            describe('subscribe', () => {
                it('does not error if disconnect after subscribe', async () => {
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
                })

                it('does not error if disconnect after subscribe with resend', async () => {
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
                })
            })
        })
    })

    describe('StreamrClient', () => {
        let stream
        let waitForStorage
        let publishTestMessages

        // These tests will take time, especially on Travis
        const TIMEOUT = 30 * 1000

        const attachSubListeners = (sub) => {
            const onSubscribed = jest.fn()
            sub.on('subscribed', onSubscribed)
            const onResent = jest.fn()
            sub.on('resent', onResent)
            const onUnsubscribed = jest.fn()
            sub.on('unsubscribed', onUnsubscribed)
            return {
                onSubscribed,
                onUnsubscribed,
                onResent,
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
                await Connection.closeOpen()
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        it('is stream publisher', async () => {
            const publisherId = await client.getPublisherId()
            const res = await client.isStreamPublisher(stream.id, publisherId)
            expect(res).toBe(true)
        })

        describe('Pub/Sub', () => {
            it('client.publish does not error', async () => {
                await client.publish(stream.id, {
                    test: 'client.publish',
                })
                await wait(TIMEOUT * 0.2)
            }, TIMEOUT)

            it('Stream.publish does not error', async () => {
                await stream.publish({
                    test: 'Stream.publish',
                })
                await wait(TIMEOUT * 0.2)
            }, TIMEOUT)

            it('client.publish with Stream object as arg', async () => {
                await client.publish(stream, {
                    test: 'client.publish.Stream.object',
                })
                await wait(TIMEOUT * 0.2)
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
                    client.connection.enableAutoDisconnect(false)
                    const subTask = client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)

                    const unsubTask = client.unsubscribe(stream)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await unsubTask
                    await subTask
                    await wait(TIMEOUT * 0.2)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed after started subscribing without resend', async () => {
                    client.connection.enableAutoDisconnect(false)
                    const subTask = client.subscribe({
                        stream: stream.id,
                    }, () => {})
                    const subSession = client.subscriber.getSubscriptionSession(stream)
                    const events = attachSubListeners(subSession)
                    let unsubTask
                    const startedSubscribing = Defer()
                    subSession.once('subscribing', startedSubscribing.wrap(() => {
                        unsubTask = client.unsubscribe(stream)
                    }))

                    await Promise.all([
                        startedSubscribing,
                        unsubTask,
                        subTask,
                    ])
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await wait(TIMEOUT * 0.2)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                describe('with resend', () => {
                    it('client.subscribe then unsubscribe before subscribed', async () => {
                        client.connection.enableAutoDisconnect(false)
                        const subTask = client.subscribe({
                            stream: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, () => {})

                        const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))

                        expect(client.getSubscriptions(stream.id)).toHaveLength(1)

                        const unsubTask = client.unsubscribe(stream)

                        expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                        await unsubTask
                        await subTask
                        await wait(TIMEOUT * 0.2)
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                    }, TIMEOUT)

                    it('client.subscribe then unsubscribe ignores messages with resend', async () => {
                        const onMessage = jest.fn()
                        const subTask = client.subscribe({
                            stream: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, onMessage)

                        const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))
                        const unsubTask = client.unsubscribe(stream)
                        expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately

                        const msg = Msg()
                        await stream.publish(msg)
                        await waitForStorage(msg)

                        await unsubTask
                        await subTask
                        await wait(TIMEOUT * 0.2)
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                        expect(onMessage).toHaveBeenCalledTimes(0)
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
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)
            })

            it('client.subscribe (realtime)', async () => {
                const id = Date.now()
                const done = Defer()
                const sub = await client.subscribe({
                    stream: stream.id,
                }, done.wrap(async (parsedContent, streamMessage) => {
                    expect(parsedContent.id).toBe(id)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                }))

                // Publish after subscribed
                await stream.publish({
                    id,
                })
                await done
                // All good, unsubscribe
                await client.unsubscribe(sub)
            })

            it('client.subscribe with onMessage & collect', async () => {
                const onMessageMsgs = []
                const sub = await client.subscribe({
                    stream: stream.id,
                }, async (msg) => {
                    onMessageMsgs.push(msg)
                })

                const published = await publishTestMessages(MAX_MESSAGES)
                await expect(async () => sub.collect(1)).rejects.toThrow('iterate')
                expect(onMessageMsgs).toEqual(published)
            })

            it('should resubscribe on unexpected disconnection', async () => {
                const otherClient = createClient({
                    auth: client.options.auth,
                })

                try {
                    await Promise.all([
                        client.connect(),
                        otherClient.connect(),
                        otherClient.session.getSessionToken(),
                    ])

                    const done = Defer()

                    const msgs = []

                    await otherClient.subscribe(stream, (msg) => {
                        msgs.push(msg)

                        if (msgs.length === MAX_MESSAGES) {
                            // should eventually get here
                            done.resolve()
                        }
                    })

                    const onConnectionMessage = jest.fn(() => {
                        // disconnect after every message
                        otherClient.connection.socket.close()
                    })

                    otherClient.connection.on(ControlMessage.TYPES.BroadcastMessage, onConnectionMessage)
                    otherClient.connection.on(ControlMessage.TYPES.UnicastMessage, onConnectionMessage)

                    const onConnected = jest.fn()
                    const onDisconnected = jest.fn()
                    otherClient.connection.on('connected', onConnected)
                    otherClient.connection.on('disconnected', onDisconnected)

                    const published = await publishTestMessages(MAX_MESSAGES, {
                        delay: 250,
                    })

                    await done
                    // wait for final re-connection after final message
                    await otherClient.connection.nextConnection()

                    expect(msgs).toEqual(published)

                    // check disconnect/connect actually happened
                    expect(onConnectionMessage).toHaveBeenCalledTimes(published.length)
                    expect(onConnected).toHaveBeenCalledTimes(published.length)
                    expect(onDisconnected).toHaveBeenCalledTimes(published.length)
                } finally {
                    await Promise.all([
                        otherClient.disconnect(),
                        client.disconnect(),
                    ])
                }
            }, 20000)

            it('publish and subscribe a sequence of messages', async () => {
                client.enableAutoConnect()
                const done = Defer()
                const received = []
                const sub = await client.subscribe({
                    stream: stream.id,
                }, done.wrapError((parsedContent, streamMessage) => {
                    received.push(parsedContent)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                    if (received.length === MAX_MESSAGES) {
                        done.resolve(client.unsubscribe(sub))
                    }
                }))

                // Publish after subscribed
                const published = await publishTestMessages(MAX_MESSAGES, {
                    wait: 100,
                })

                await done
                expect(received).toEqual(published)
            })

            test('publish does not disconnect after each message with autoDisconnect', async () => {
                await client.disconnect()
                const onConnected = jest.fn()
                const onDisconnected = jest.fn()
                client.on('disconnected', onDisconnected)
                client.on('connected', onConnected)

                client.options.publishAutoDisconnectDelay = 1000 // eslint-disable-line require-atomic-updates

                client.enableAutoConnect()
                client.enableAutoDisconnect()
                await publishTestMessages(3, {
                    delay: 150,
                })

                await wait(client.options.publishAutoDisconnectDelay * 1.5)

                expect(onConnected).toHaveBeenCalledTimes(1)
                expect(onDisconnected).toHaveBeenCalledTimes(1)
            })

            it('client.subscribe with resend from', async () => {
                const done = Defer()
                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const received = []

                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, done.wrapError(async (parsedContent, streamMessage) => {
                    received.push(parsedContent)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                    if (received.length === published.length) {
                        done.resolve()
                    }
                }))

                await done
                expect(received).toEqual(published)
                // All good, unsubscribe
                await client.unsubscribe(sub)
                expect(client.getSubscriptions(stream.id)).toHaveLength(0)
            }, TIMEOUT)

            it('client.subscribe with resend last', async () => {
                const done = Defer()
                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const received = []

                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2
                    },
                }, done.wrapError(async (parsedContent, streamMessage) => {
                    received.push(parsedContent)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                    if (received.length === 2) {
                        done.resolve()
                    }
                }))

                await done
                // All good, unsubscribe
                await client.unsubscribe(sub)
                expect(received).toEqual(published.slice(-2))
                expect(client.getSubscriptions(stream.id)).toHaveLength(0)
            }, TIMEOUT)

            it('client.subscribe (realtime with resend)', async () => {
                const done = Defer()
                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const received = []

                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2
                    },
                }, done.wrapError(async (parsedContent, streamMessage) => {
                    received.push(parsedContent)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                    if (received.length === 3) {
                        done.resolve()
                    }
                }))

                const [msg] = await publishTestMessages(1)

                await done
                // All good, unsubscribe
                await client.unsubscribe(sub)
                expect(received).toEqual([...published.slice(-2), msg])
                expect(client.getSubscriptions(stream.id)).toHaveLength(0)
            }, TIMEOUT)
        })

        describe('resend', () => {
            let timestamps = []
            let published = []

            beforeEach(async () => {
                publishTestMessages = getPublishTestMessages(client, {
                    stream,
                    waitForLast: true,
                    waitForLastTimeout: 9000,
                })

                const publishedRaw = await publishTestMessages.raw(5)
                timestamps = publishedRaw.map(([, raw]) => raw.streamMessage.getTimestamp())
                published = publishedRaw.map(([msg]) => msg)
            })

            it('resend last', async () => {
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        last: 3,
                    },
                })

                expect(await sub.collect()).toEqual(published.slice(-3))
            })

            it('resend from', async () => {
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[3],
                        },
                    },
                })

                expect(await sub.collect()).toEqual(published.slice(3))
            })

            it('resend range', async () => {
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[0],
                        },
                        to: {
                            timestamp: timestamps[3] - 1,
                        },
                    },
                })

                expect(await sub.collect()).toEqual(published.slice(0, 3))
            })

            it('works with message handler + resent event', async () => {
                const messages = []
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        last: 3,
                    },
                }, (msg) => {
                    messages.push(msg)
                })

                await waitForEvent(sub, 'resent')
                expect(messages).toEqual(published.slice(-3))
            })
        }, 10000)

        describe('utf-8 encoding', () => {
            it('decodes realtime messages correctly', async () => {
                const publishedMessage = Msg({
                    content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
                })
                const sub = await client.subscribe(stream.id)
                await client.publish(stream.id, publishedMessage)
                const messages = await sub.collect(1)
                expect(messages).toEqual([publishedMessage])
            })

            it('decodes resent messages correctly', async () => {
                const publishedMessage = Msg({
                    content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
                })
                await client.publish(stream.id, publishedMessage)
                await waitForStorage(publishedMessage)
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        last: 3,
                    },
                })
                const messages = await sub.collect()
                expect(messages).toEqual([publishedMessage])
            }, 10000)
        })
    })
})
