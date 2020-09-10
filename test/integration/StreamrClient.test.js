import fs from 'fs'
import path from 'path'

import fetch from 'node-fetch'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { wait, waitForEvent } from 'streamr-test-utils'
import { ethers } from 'ethers'
import Debug from 'debug'

import { uid } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const debug = Debug('StreamrClient').extend('test')

const { StreamMessage } = MessageLayer
const WebSocket = require('ws')

const { SubscribeRequest, UnsubscribeRequest, ResendLastRequest } = ControlLayer

describe('StreamrClient', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: ethers.Wallet.createRandom().privateKey,
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
        expectErrors = 0
        onError = jest.fn()
    })

    beforeAll(async () => {
        await checkConnection()
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
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

        describe('resend', () => {
            let stream

            let timestamps = []

            beforeEach(async () => {
                client = createClient()
                await client.connect()

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

            it('should not subscribe to unsubscribed streams on reconnect', async (done) => {
                client = createClient()
                await client.connect()
                const sessionToken = await client.session.getSessionToken()

                const stream = await client.createStream({
                    name: uid('stream')
                })

                const connectionEventSpy = jest.spyOn(client.connection, '_send')
                const sub = client.subscribe(stream.id, () => {})

                sub.once('subscribed', async () => {
                    await wait(100)
                    await client.unsubscribe(sub)
                })

                sub.once('unsubscribed', async () => {
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

                    done()
                })
            })

            it('should not subscribe after resend() on reconnect', async (done) => {
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
                }, () => {})

                sub.once('initial_resend_done', () => {
                    setTimeout(async () => {
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

                        // key exchange stream subscription should not have been sent yet
                        expect(connectionEventSpy.mock.calls.length).toEqual(1)
                        done()
                    }, 2000)
                })
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
                })
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

                    const sub = client.subscribe({
                        stream: stream.id,
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

                it('does not error if disconnect after subscribe with resend', async (done) => {
                    client = createClient({
                        autoConnect: true,
                        autoDisconnect: true,
                    })

                    await client.connect()
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
        let stream

        // These tests will take time, especially on Travis
        const TIMEOUT = 5 * 1000

        const createStream = async () => {
            const name = `StreamrClient-integration-${Date.now()}`
            expect(client.isConnected()).toBeTruthy()

            const s = await client.createStream({
                name,
                requireSignedData: true,
            })

            expect(s.id).toBeTruthy()
            expect(s.name).toEqual(name)
            expect(s.requireSignedData).toBe(true)
            return s
        }

        beforeEach(async () => {
            client = createClient()
            await client.connect()
            stream = await createStream()
            const publisherId = await client.getPublisherId()
            const res = await client.isStreamPublisher(stream.id, publisherId.toLowerCase())
            expect(res).toBe(true)
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

        describe('Pub/Sub', () => {
            it('client.publish does not error', async (done) => {
                await client.publish(stream.id, {
                    test: 'client.publish',
                })
                setTimeout(() => done(), TIMEOUT * 0.5)
            }, TIMEOUT)

            it('Stream.publish does not error', async (done) => {
                await stream.publish({
                    test: 'Stream.publish',
                })
                setTimeout(() => done(), TIMEOUT * 0.5)
            }, TIMEOUT)

            it('client.publish with Stream object as arg', async (done) => {
                await client.publish(stream, {
                    test: 'client.publish.Stream.object',
                })
                setTimeout(() => done(), TIMEOUT * 0.5)
            }, TIMEOUT)

            describe('subscribe/unsubscribe', () => {
                it('client.subscribe then unsubscribe after subscribed without resend', async () => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                    const sub = client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1) // has subscription immediately
                    await new Promise((resolve) => sub.once('subscribed', resolve))
                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const t = new Promise((resolve) => sub.once('unsubscribed', resolve))
                    await client.unsubscribe(sub)
                    await t
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                    expect(onSubscribed).toHaveBeenCalledTimes(1)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed without resend', async () => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                    const sub = client.subscribe({
                        stream: stream.id,
                    }, () => {})

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)
                    const t = client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await t
                    await wait(TIMEOUT * 0.2)
                    expect(onSubscribed).toHaveBeenCalledTimes(0)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed with resend', async () => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                    const sub = client.subscribe({
                        stream: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, () => {})

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)
                    const t = client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await t
                    await wait(TIMEOUT * 0.2)
                    expect(onSubscribed).toHaveBeenCalledTimes(0)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed with resend', async () => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                    const sub = client.subscribe({
                        stream: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, () => {})

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onResent = jest.fn()
                    sub.on('resent', onResent)
                    const onNoResend = jest.fn()
                    sub.on('no_resend', onNoResend)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)
                    const t = client.unsubscribe(sub)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await t
                    await wait(TIMEOUT * 0.2)
                    expect(onResent).toHaveBeenCalledTimes(0)
                    expect(onNoResend).toHaveBeenCalledTimes(0)
                    expect(onSubscribed).toHaveBeenCalledTimes(0)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe ignores messages', async () => {
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                    const onMessage = jest.fn()
                    const sub = client.subscribe({
                        stream: stream.id,
                    }, onMessage)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onResent = jest.fn()
                    sub.on('resent', onResent)
                    const onNoResend = jest.fn()
                    sub.on('no_resend', onNoResend)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)
                    await new Promise((resolve) => sub.once('subscribed', resolve))
                    const msg = {
                        name: uid('msg')
                    }
                    const t = client.unsubscribe(sub)
                    await stream.publish(msg)
                    await t
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    await wait(TIMEOUT * 0.2)
                    expect(onResent).toHaveBeenCalledTimes(0)
                    expect(onMessage).toHaveBeenCalledTimes(0)
                    expect(onNoResend).toHaveBeenCalledTimes(0)
                    expect(onSubscribed).toHaveBeenCalledTimes(1)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe ignores messages with resend', async () => {
                    const msg = {
                        name: uid('msg')
                    }
                    await stream.publish(msg)

                    await wait(TIMEOUT * 0.5)
                    const onMessage = jest.fn()
                    const sub = client.subscribe({
                        stream: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, onMessage)

                    expect(client.getSubscriptions(stream.id)).toHaveLength(1)
                    const onSubscribed = jest.fn()
                    sub.on('subscribed', onSubscribed)
                    const onResent = jest.fn()
                    sub.on('resent', onResent)
                    const onNoResend = jest.fn()
                    sub.on('no_resend', onNoResend)
                    const onUnsubscribed = jest.fn()
                    sub.on('unsubscribed', onUnsubscribed)
                    client.debug(1)
                    await new Promise((resolve) => sub.once('subscribed', resolve))
                    client.debug(2)
                    const t = new Promise((resolve) => sub.once('unsubscribed', resolve))
                    await client.unsubscribe(sub)
                    client.debug(3)
                    await t
                    client.debug(4)
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0) // lost subscription immediately
                    expect(onResent).toHaveBeenCalledTimes(0)
                    expect(onMessage).toHaveBeenCalledTimes(0)
                    expect(onNoResend).toHaveBeenCalledTimes(0)
                    expect(onSubscribed).toHaveBeenCalledTimes(1)
                    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT * 2)
            })

            it('client.subscribe (realtime)', async (done) => {
                const id = Date.now()
                const sub = client.subscribe({
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
                sub.once('subscribed', () => {
                    stream.publish({
                        id,
                    })
                })
            })

            it('publish and subscribe a sequence of messages', async (done) => {
                client.options.autoConnect = true
                const nbMessages = 3
                const intervalMs = 100
                let counter = 0
                const sub = client.subscribe({
                    stream: stream.id,
                }, async (parsedContent, streamMessage) => {
                    expect(parsedContent.i).toBe(counter)
                    counter += 1

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    client.debug({
                        parsedContent,
                        counter,
                        nbMessages,
                    })
                    if (counter === nbMessages) {
                        // All good, unsubscribe
                        await client.unsubscribe(sub)
                        await client.disconnect()
                        await wait(1000)
                        done()
                    }
                })

                // Publish after subscribed
                await new Promise((resolve) => sub.once('subscribed', resolve))
                for (let i = 0; i < nbMessages; i++) {
                    // eslint-disable-next-line no-await-in-loop
                    await wait(intervalMs)
                    // eslint-disable-next-line no-await-in-loop
                    await stream.publish({
                        i,
                    })
                }
            }, 20000)

            it('client.subscribe with resend from', async (done) => {
                // Publish message
                await client.publish(stream.id, {
                    test: 'client.subscribe with resend',
                })

                // Check that we're not subscribed yet
                expect(client.getSubscriptions()[stream.id]).toBe(undefined)

                // Add delay: this test needs some time to allow the message to be written to Cassandra
                await wait(TIMEOUT * 0.8)
                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    expect(parsedContent.test).toBe('client.subscribe with resend')

                    // Check signature stuff
                    // WARNING: digging into internals
                    const subStream = client.subscriber._getSubscribedStreamPartition(stream.id, 0) // eslint-disable-line no-underscore-dangle
                    const publishers = await subStream.getPublishers()
                    const map = {}
                    map[client.publisher.signer.address.toLowerCase()] = true
                    expect(publishers).toEqual(map)
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    const t = new Promise((resolve) => sub.once('unsubscribed', resolve))
                    await client.unsubscribe(sub)
                    await t
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                    done()
                })
            }, TIMEOUT)

            it('client.subscribe with resend last', async (done) => {
                // Publish message
                await client.publish(stream.id, {
                    test: 'client.subscribe with resend',
                })

                // Check that we're not subscribed yet
                expect(client.getSubscriptions(stream.id)).toHaveLength(0)

                // Add delay: this test needs some time to allow the message to be written to Cassandra
                await wait(TIMEOUT * 0.7)

                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1,
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    expect(parsedContent.test).toEqual('client.subscribe with resend')

                    // Check signature stuff
                    // WARNING: digging into internals
                    const subStream = client.subscriber._getSubscribedStreamPartition(stream.id, 0) // eslint-disable-line no-underscore-dangle
                    const publishers = await subStream.getPublishers()
                    const map = {}
                    map[client.publisher.signer.address.toLowerCase()] = true
                    expect(publishers).toEqual(map)
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()

                    // All good, unsubscribe
                    const t = new Promise((resolve) => sub.once('unsubscribed', resolve))
                    await client.unsubscribe(sub)
                    await t
                    expect(client.getSubscriptions(stream.id)).toHaveLength(0)
                    done()
                })
            }, TIMEOUT)

            it('client.subscribe (realtime with resend)', (done) => {
                const id = Date.now()
                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1,
                    },
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
                sub.once('subscribed', () => {
                    stream.publish({
                        id,
                    })
                })
            }, 30000)
        })

        describe('utf-8 encoding', () => {
            const publishedMessage = {
                content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
            }

            it('decodes realtime messages correctly', async (done) => {
                client.once('error', done)
                client.subscribe(stream.id, (msg) => {
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
})
