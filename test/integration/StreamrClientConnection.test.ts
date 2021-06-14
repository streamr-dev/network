import fetch from 'node-fetch'
import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'
import { StorageNode } from '../../src/stream/StorageNode'

import { clientOptions } from './devEnvironment'

const WebSocket = require('ws')

const { SubscribeRequest, UnsubscribeRequest, ResendLastRequest } = ControlLayer

describeRepeats('StreamrClient Connection', () => {
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: StreamrClient

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // disconnectDelay: 500,
            // publishAutoDisconnectDelay: 250,
            // @ts-expect-error
            maxRetries: 2,
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
                            resolve(undefined)
                            ws.close()
                        })
                        ws.once('error', (err: any) => {
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
                throw new Error('Integration testing requires that core-api '
                    + 'and network ("entire stack") are running in the background. '
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
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

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
                    done.resolve(undefined)
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
            const sessionToken = await client.session.getSessionToken()!

            const stream = await client.createStream({
                name: uid('stream')
            })
            await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

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
                sessionToken: sessionToken!,
                requestId: connectionEventSpy.mock.calls[0][0].requestId,
            })])

            expect(connectionEventSpy.mock.calls[1]).toEqual([new UnsubscribeRequest({
                streamId: stream.id,
                streamPartition: 0,
                // @ts-expect-error
                sessionToken: sessionToken!,
                requestId: connectionEventSpy.mock.calls[1][0].requestId,
            })])
        })

        it('should not subscribe after resend() on reconnect', async () => {
            client = createClient()
            await client.connect()
            const sessionToken = await client.session.getSessionToken()!

            const stream = await client.createStream({
                name: uid('stream')
            })
            await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

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
                sessionToken: sessionToken!,
                numberLast: 10,
                requestId: connectionEventSpy.mock.calls[0][0].requestId,
            })])
            expect(msgs).toEqual([])

            // key exchange stream subscription should not have been sent yet
            expect(connectionEventSpy.mock.calls.length).toEqual(1)
            await client.disconnect()
        }, 10000)

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
        }, 10000)
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
                await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
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
                await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

                const message = {
                    id1: uid('msg')
                }
                const p = client.publish(stream.id, message)
                await wait(0)
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
                await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

                const message = {
                    id1: uid('msg')
                }
                const p = client.publish(stream.id, message)
                await wait(0)
                client.debug('about to intentionally break publish...')
                await client.disconnect() // start async disconnect after publish started
                await expect(p).rejects.toThrow('Failed to publish')
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
                await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

                await client.subscribe({
                    streamId: stream.id,
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
                await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

                await client.subscribe({
                    streamId: stream.id,
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
