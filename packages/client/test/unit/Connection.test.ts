import WebSocket, { AddressInfo, Server } from 'ws'
import { wait } from 'streamr-test-utils'
import { Debug, describeRepeats } from '../utils'

import Connection from '../../src/Connection'
import { Defer } from '../../src/utils'
import { Todo } from '../../src/types'

/* eslint-disable require-atomic-updates */

const debug = Debug('StreamrClient').extend('test')

describeRepeats('Connection', () => {
    let s: Connection
    let onConnected: Todo
    let onConnecting: Todo
    let onDisconnecting: Todo
    let onDisconnected: Todo
    let onReconnecting: Todo
    let onDone: Todo
    let onError: Todo
    let onMessage: Todo
    let wss: Server
    let port: number
    let errors: Todo

    let expectErrors = 0 // check no errors by default
    beforeAll((done) => {
        wss = new Server({
            port: 0,
        }).once('listening', () => {
            port = (wss.address() as AddressInfo).port
            done()
        }).on('connection', (ws) => {
            ws.on('message', (msg) => ws.send(msg))
        })
    })

    afterAll((done) => {
        if (s) {
            s.removeAllListeners()
        }

        if (wss) {
            wss.removeAllListeners()
            wss.close(done)
        }
    })

    afterAll(async () => {
        await wait(1000) // wait a moment for wss to truly close
    })

    beforeEach(() => {
        s = new Connection({
            url: `ws://localhost:${port}/`,
            maxRetries: 2,
            disconnectDelay: 3,
        })

        onConnected = jest.fn()
        s.on('connected', onConnected)
        onConnecting = jest.fn()
        s.on('connecting', onConnecting)
        onDisconnected = jest.fn()
        s.on('disconnected', onDisconnected)
        onDone = jest.fn()
        s.on('done', onDone)
        onDisconnecting = jest.fn()
        s.on('disconnecting', onDisconnecting)
        onReconnecting = jest.fn()
        s.on('reconnecting', onReconnecting)

        errors = []
        const currentErrors = errors
        onError = jest.fn((err) => {
            currentErrors.push(err)
        })

        s.on('error', onError)
        onMessage = jest.fn()
        s.on('message', onMessage)
        expectErrors = 0
        debug('starting test')
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        try {
            expect(errors).toHaveLength(expectErrors)
        } catch (err) {
            // print errors
            debug('onError calls:', onError.mock.calls)
            throw err
        }
    })

    afterEach(async () => {
        debug('disconnecting after test')
        await s.disconnect()
        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('basics', () => {
        it('can connect & disconnect', async () => {
            await s.connect()
            expect(s.getState()).toBe('connected')
            await s.disconnect()
            expect(s.getState()).toBe('disconnected')
            // check events
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('can connect after already connected', async () => {
            await s.connect()
            await s.connect()
            expect(s.getState()).toBe('connected')

            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
        })

        it('can connect twice in same tick', async () => {
            await Promise.all([
                s.connect(),
                s.connect(),
            ])
            expect(s.getState()).toBe('connected')
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
        })

        it('can connect and disconnect in same tick', async () => {
            const connectTask = s.connect()
            const disconnectTask = s.disconnect()
            await expect(() => connectTask).rejects.toThrow()
            await disconnectTask
            expect(s.getState()).toBe('disconnected')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onConnecting).toHaveBeenCalledTimes(0)
            expect(onDisconnected).toHaveBeenCalledTimes(0)
            expect(onDisconnecting).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(0)
        })

        it('tracks open sockets and can close them', async () => {
            expect(Connection.getOpen()).toEqual(0)
            await s.connect()
            expect(Connection.getOpen()).toEqual(1)
            await s.disconnect()
            expect(Connection.getOpen()).toEqual(0)
            await s.connect()
            expect(Connection.getOpen()).toEqual(1)
            const s2 = new Connection({
                url: 'badurl',
                maxRetries: 2,
                disconnectDelay: 1,
            })

            await expect(async () => (
                s2.connect()
            )).rejects.toThrow()
            expect(Connection.getOpen()).toEqual(1)

            const s3 = new Connection({
                url: `ws://localhost:${port}/`,
                disconnectDelay: 1,
            })
            await s3.connect()
            expect(Connection.getOpen()).toEqual(2)
            await Connection.closeOpen()
            expect(Connection.getOpen()).toEqual(0)
            await wait(250)
            expect(Connection.getOpen()).toEqual(0)
            expect(s.getState()).toEqual('disconnected')
        })

        it('fires all events once if connected twice in same tick', async () => {
            await Promise.all([
                s.connect(),
                s.connect(),
            ])
            expect(s.getState()).toBe('connected')
            await Promise.all([
                s.disconnect(),
                s.disconnect(),
            ])
            expect(s.getState()).toBe('disconnected')

            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
        })

        it('fires all events minimally if connected twice in same tick then reconnected', async () => {
            await Promise.all([
                s.connect(),
                s.connect(),
            ])
            s.socket?.close()
            await s.nextConnection()

            expect(s.getState()).toBe('connected')

            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(2)
        })

        it('can connect again after disconnect', async () => {
            await s.connect()
            expect(s.getState()).toBe('connected')
            const oldSocket = s.socket
            await s.disconnect()
            expect(s.getState()).toBe('disconnected')
            await s.connect()
            expect(s.getState()).toBe('connected')
            // check events
            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
            // ensure new socket
            expect(s.socket).not.toBe(oldSocket)
        })

        describe('connect/disconnect inside event handlers', () => {
            it('can handle connect on connecting event', async () => {
                const done = Defer()
                s.once('connecting', done.wrap(async () => {
                    await s.connect()
                    expect(s.getState()).toBe('connected')
                    expect(onConnected).toHaveBeenCalledTimes(1)
                    expect(onConnecting).toHaveBeenCalledTimes(1)
                }))
                await s.connect()
                expect(s.getState()).toBe('connected')
                await done
            })

            it('can handle disconnect on connecting event', async () => {
                const done = Defer()
                s.once('connecting', done.wrap(async () => {
                    await s.disconnect()
                    expect(s.getState()).toBe('disconnected')
                    expect(onDone).toHaveBeenCalledTimes(1)
                }))

                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.getState()).toBe('disconnected')
                await done
            })

            it('can handle disconnect on connected event', async () => {
                const done = Defer()
                s.once('connected', done.wrap(async () => {
                    await s.disconnect()
                    expect(s.getState()).toBe('disconnected')
                }))

                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.getState()).not.toBe('connected')
                await done
                expect(onDone).toHaveBeenCalledTimes(1)
            })

            it('can handle disconnect on connected event, repeated', async () => {
                const done = Defer()
                // connect -> disconnect in connected
                // disconnect
                s.once('connected', done.wrapError(async () => {
                    await expect(async () => {
                        await s.disconnect()
                    }).rejects.toThrow()
                }))

                s.once('disconnected', done.wrapError(async () => {
                    s.once('connected', done.wrapError(async () => {
                        await s.disconnect()
                    }))

                    await expect(async () => {
                        await s.connect()
                    }).rejects.toThrow()
                    done.resolve(undefined)
                }))

                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                await done
                await s.disconnect()
                expect(s.getState()).toBe('disconnected')
                expect(onDone).toHaveBeenCalledTimes(1)
            })

            it('can handle connect on disconnecting event', async () => {
                const done = Defer()
                s.once('disconnecting', done.wrap(async () => {
                    await s.connect()
                    expect(s.getState()).toBe('connected')
                }))

                await s.connect()
                await expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow('connected before disconnected')
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(s.getState()).toBe('connected')
                await done
                await wait(250)
                expect(s.getState()).toBe('connected')
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(onConnected).toHaveBeenCalledTimes(1)
                expect(onDisconnected).toHaveBeenCalledTimes(0)
                expect(onDisconnecting).toHaveBeenCalledTimes(1)
            })

            it('delays disconnection', async () => {
                await s.connect()
                const DELAY = 150
                s.options.disconnectDelay = DELAY
                const prevSocket = s.socket
                const t = expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow('connected before disconnected')
                await wait(DELAY / 2)
                expect(onDisconnected).toHaveBeenCalledTimes(0)
                await s.connect()
                expect(s.getState()).toBe('connected')
                await t
                expect(s.getState()).toBe('connected')
                expect(s.socket).toBe(prevSocket)
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(s.getState()).toBe('connected')
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(onConnected).toHaveBeenCalledTimes(2)
                expect(onDisconnected).toHaveBeenCalledTimes(0)
                expect(onDisconnecting).toHaveBeenCalledTimes(1)
            })

            it('can handle connect on disconnected event', async () => {
                const done = Defer()
                try {
                    await s.connect()

                    s.once('disconnected', done.wrap(async () => {
                        await s.connect()
                    }))

                    await expect(async () => {
                        await s.disconnect()
                    }).rejects.toThrow()
                    expect(s.getState()).toBe('connected')
                } finally {
                    await done
                    expect(s.getState()).toBe('connected')
                    expect(onDone).toHaveBeenCalledTimes(0)
                }
            })
        })

        it('rejects if no url', async () => {
            s = new Connection({
                url: undefined,
                maxRetries: 2,
                disconnectDelay: 1,
            })
            s.on('connected', onConnected)
            s.on('error', onError)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('not defined')
            expect(onConnected).toHaveBeenCalledTimes(0)
        })

        it('rejects if bad url', async () => {
            s = new Connection({
                url: 'badurl',
                maxRetries: 2,
                disconnectDelay: 1,
            })
            s.on('connected', onConnected)
            s.on('error', onError)
            s.on('done', onDone)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('Invalid URL')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('rejects if cannot connect', async () => {
            s = new Connection({
                url: 'wss://streamr.network/nope',
                maxRetries: 2,
                disconnectDelay: 1,
            })
            s.on('connected', onConnected)
            s.on('done', onDone)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('Unexpected server response')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('disconnect does not error if never connected', async () => {
            expect(s.getState()).toBe('disconnected')
            await s.disconnect()
            expect(s.getState()).toBe('disconnected')
            expect(onDisconnected).toHaveBeenCalledTimes(0)
        })

        it('disconnect does not error if already disconnected', async () => {
            await s.connect()
            await s.disconnect()
            expect(s.getState()).toBe('disconnected')
            await s.disconnect()
            expect(s.getState()).toBe('disconnected')
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('disconnect does not error if already closing', async () => {
            await s.connect()
            await Promise.all([
                s.disconnect(),
                s.disconnect(),
            ])
            expect(s.getState()).toBe('disconnected')
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('can handle disconnect before connect complete', async () => {
            s.retryCount = 2 // adds some delay
            const onConnectedTooEarly = () => {
                throw new Error('test invalidated as connected before we could disconnect')
            }
            s.once('connected', onConnectedTooEarly)
            await Promise.all([
                new Promise((resolve, reject) => {
                    s.once('connecting', () => {
                        setImmediate(() => {
                            s.off('connected', onConnectedTooEarly)
                            // eslint-disable-next-line promise/catch-or-return
                            s.disconnect().then(resolve, reject)
                        })
                    })
                }),
                expect(async () => (
                    s.connect()
                )).rejects.toThrow(),
            ]).finally(() => {
                s.off('connected', onConnectedTooEarly)
            })
            expect(s.getState()).toBe('disconnected')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onConnecting).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('can handle connect before disconnect complete', async () => {
            await s.connect()

            const onDisconnectedTooEarly = () => {
                throw new Error('test invalidated as fully disconnected before we could connect')
            }

            await Promise.all([
                new Promise((resolve, reject) => {
                    s.once('disconnected', onDisconnectedTooEarly)
                    s.once('disconnecting', () => {
                        setImmediate(() => {
                            s.off('disconnected', onDisconnectedTooEarly)
                            // eslint-disable-next-line promise/catch-or-return
                            s.connect().then(resolve, reject)
                        })
                    })
                }),
                expect(async () => (
                    s.disconnect()
                )).rejects.toThrow(),
            ]).finally(() => {
                s.off('disconnected', onDisconnectedTooEarly)
            })
            expect(s.getState()).toBe('connected')
            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(0)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(0)
        })

        it('emits error but does not disconnect if connect event handler fails', async () => {
            expectErrors = 1
            const error = new Error('expected error')
            const done = Defer()
            s.once('connected', () => {
                throw error // expected
            })
            s.once('error', done.wrap(async (err) => {
                expect(err).toBe(error)
                await wait(0)
                expect(s.getState()).toBe('connected')
            }))
            await s.connect()
            expect(s.getState()).toBe('connected')
            expect(onDone).toHaveBeenCalledTimes(0)
            await done
        })
    })

    describe('isConnectionValid', () => {
        it('works with explicit connect/disconnect', async () => {
            expect(s.isConnectionValid()).not.toBeTruthy()
            const onConnect = s.connect()
            expect(s.isConnectionValid()).toBeTruthy()
            await onConnect
            expect(s.isConnectionValid()).toBeTruthy()
            const onDisconnect = s.disconnect()
            expect(s.isConnectionValid()).not.toBeTruthy()
            await onDisconnect
            expect(s.isConnectionValid()).not.toBeTruthy()
        })

        it('handles parallel calls', async () => {
            s.enableAutoConnect()
            await Promise.all([
                s.addHandle(1),
                s.removeHandle(1),
            ])
            expect(s.isConnectionValid()).not.toBeTruthy()
        })

        it('works with autoConnect', async () => {
            s.enableAutoConnect()
            expect(s.isConnectionValid()).not.toBeTruthy()
            await s.addHandle(1)
            expect(s.isConnectionValid()).toBeTruthy()
            await s.removeHandle(1)
            expect(s.isConnectionValid()).not.toBeTruthy()
        })

        it('works with autoDisconnect', async () => {
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            expect(s.isConnectionValid()).not.toBeTruthy()
            await s.addHandle(1)
            expect(s.isConnectionValid()).toBeTruthy()
            await s.removeHandle(1)
            expect(s.isConnectionValid()).not.toBeTruthy()
            const onDisconnect = s.disconnect()
            expect(s.isConnectionValid()).not.toBeTruthy()
            await onDisconnect
            expect(s.isConnectionValid()).not.toBeTruthy()
        })
    })

    describe('nextConnection', () => {
        it('resolves on next connection', async () => {
            let resolved = false
            const next = s.nextConnection().then((v) => {
                resolved = true
                return v
            })
            await s.connect()
            await next
            expect(resolved).toBe(true)
            expect(s.getState()).toBe('connected')
        })

        it('resolves on next connection via autoConnect', async () => {
            s.enableAutoConnect()
            let resolved = false
            const next = s.nextConnection().then((v) => {
                resolved = true
                return v
            })
            await s.addHandle(1)
            await next
            expect(resolved).toBe(true)
            expect(s.getState()).toBe('connected')
        })

        it('rejects on next error via autoConnect', async () => {
            s.enableAutoConnect()
            let errored = false
            s.options.url = 'badurl'
            const next = s.nextConnection().catch((err) => {
                errored = true
                throw err
            })
            await expect(async () => {
                await s.addHandle(1)
            }).rejects.toThrow()
            await expect(async () => {
                await next
            }).rejects.toThrow()
            expect(errored).toBe(true)
            expect(s.getState()).toBe('disconnected')
        })

        it('rejects on next error', async () => {
            let errored = false
            s.options.url = 'badurl'
            const next = s.nextConnection().catch((err) => {
                errored = true
                throw err
            })
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow()
            await expect(async () => {
                await next
            }).rejects.toThrow()
            expect(errored).toBe(true)
            expect(s.getState()).toBe('disconnected')
        })

        it('rejects if disconnected while connecting', async () => {
            let errored = false
            const next = s.nextConnection().catch((err) => {
                errored = true
                throw err
            })
            await Promise.all([
                expect(async () => {
                    await s.connect()
                }).rejects.toThrow(),
                s.disconnect()
            ])
            await expect(async () => {
                await next
            }).rejects.toThrow()
            expect(s.getState()).toBe('disconnected')
            expect(errored).toBe(true)
        })
    })

    describe('needsConnection', () => {
        it('connects if autoConnect/autoDisconnect is on', async () => {
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            const t = s.addHandle(1)
            await s.needsConnection()
            await t
            expect(s.getState()).toBe('connected')
        })

        it('errors if intentionally disconnected', async () => {
            await s.disconnect()
            await expect(() => (
                s.needsConnection()
            )).rejects.toThrow('Needs connection')
            expect(s.getState()).toBe('disconnected')
        })

        it('errors if autoConnect/autoDisconnect & no handles', async () => {
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            await expect(() => (
                s.needsConnection()
            )).rejects.toThrow('Needs connection')
            expect(s.getState()).toBe('disconnected')
        })

        it('ok if connected', async () => {
            await s.connect()
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('ok if connecting', async () => {
            await s.disconnect()
            const done = Defer()
            s.on('connecting', done.wrap(async () => {
                await s.needsConnection()
                expect(s.getState()).toBe('connected')
            }))

            await Promise.all([
                s.connect(),
                done
            ])

            expect(s.getState()).toBe('connected')
        })

        it('ok if unintentionally disconnected', async () => {
            await s.disconnect()
            const done = Defer()
            s.once('connected', done.wrap(async () => {
                s.socket?.close()
                await s.needsConnection()
                expect(s.getState()).toBe('connected')
            }))

            await Promise.all([
                s.connect(),
                done
            ])

            expect(s.getState()).toBe('connected')
        })

        it('ok if unintentionally disconnected + autoConnect/autoDisconnect is on', async () => {
            await s.disconnect()
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            const done = Defer()
            s.once('connected', done.wrap(async () => {
                s.socket?.close()
                await s.needsConnection()
                expect(s.getState()).toBe('connected')
            }))

            await Promise.all([
                s.addHandle(1),
                done
            ])

            expect(s.getState()).toBe('connected')
        })
    })

    describe('reconnecting', () => {
        it('reconnects if unexpectedly disconnected', async () => {
            await s.connect()
            s.socket?.close()
            await s.nextConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected + needsConnection', async () => {
            await s.connect()
            s.socket?.close()
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected on connected', async () => {
            const connectTask = s.connect()
            s.once('connected', async () => {
                s.socket?.close()
            })
            await connectTask
            expect(s.getState()).toBe('connected')
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected on connected and autoConnect/autoDisconnect is on', async () => {
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            s.once('connected', async () => {
                s.socket?.close()
            })
            await s.addHandle(1)
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected and autoConnect is on', async () => {
            await s.connect()
            s.enableAutoConnect()
            s.addHandle(1)
            s.socket?.close()
            await s.nextConnection()
            expect(s.getState()).toBe('connected')
            s.removeHandle(1)
        })

        it('emits error if reconnect fails', async () => {
            expectErrors = 1
            await s.connect()
            s.options.url = 'badurl'
            const done = Defer()
            s.once('error', done.resolve)
            s.socket?.close()
            const err = await done
            expect(err).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(s.getState()).toBe('disconnected')
            await wait(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('throws error if reconnect fails', async () => {
            expectErrors = 1
            await s.connect()
            s.options.url = 'badurl'
            s.socket?.close()
            await expect(async () => (
                s.nextConnection()
            )).rejects.toThrow('Invalid URL')
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(s.getState()).toBe('disconnected')
            await wait(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('retries multiple times when disconnected', async () => {
            s.options.maxRetries = 4
            /* eslint-disable no-underscore-dangle */
            await s.connect()
            const goodUrl = s.options.url
            let retryCount = 0
            s.options.url = 'badurl'
            const done = Defer()
            s.on('reconnecting', () => {
                retryCount += 1
                // fail first 3 tries
                // pass after
                if (retryCount >= 3) {
                    s.options.url = goodUrl
                }
            })
            s.once('connected', () => {
                done.resolve(undefined)
            })
            s.socket?.close()
            await done
            expect(s.getState()).toBe('connected')
            expect(retryCount).toEqual(3)
            /* eslint-enable no-underscore-dangle */
        }, 3000)

        it('fails if exceed max retries', async () => {
            expectErrors = 1
            await s.connect()
            const done = Defer()
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', done.resolve)
            s.socket?.close()
            const err = await done
            expect(err).toBeTruthy()
            // wait a moment for late errors
            await wait(10)
            expect(onDone).toHaveBeenCalledTimes(1)
            await done
        })

        it('resets max retries on manual connect after failure', async () => {
            expectErrors = 1
            await s.connect()
            const goodUrl = s.options.url
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            const done = Defer()
            s.once('error', done.resolve)
            s.socket?.close()
            const err = await done
            expect(err).toBeTruthy()
            s.options.url = goodUrl
            await s.connect()
            await wait(0)
            expect(s.isReconnecting()).toBeFalsy()
            expect(s.getState()).toBe('connected')
        })

        it('can try reconnect after error', async () => {
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            await expect(async () => (
                s.connect()
            )).rejects.toThrow('Invalid URL')
            expect(onDone).toHaveBeenCalledTimes(1)
            await s.disconnect() // shouldn't throw
            expect(onDone).toHaveBeenCalledTimes(1)
            expect(s.getState()).toBe('disconnected')
            // ensure close
            await expect(async () => (
                Promise.all([
                    s.connect(),
                    s.disconnect(),
                ])
            )).rejects.toThrow('disconnected before connected')
            s.options.url = goodUrl
            await s.connect()
            expect(s.getState()).toBe('connected')
            expect(onConnected).toHaveBeenCalledTimes(1)
            await s.disconnect()
            expect(onDone).toHaveBeenCalledTimes(2)
            expect(s.getState()).toBe('disconnected')
        })

        it('stops reconnecting if disconnected while reconnecting', async () => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            const done = Defer()
            // once disconnected due to error, actually close
            s.once('disconnected', done.resolve)
            // trigger reconnecting cycle
            s.socket?.close()
            await done
            // i.e. would reconnect if not closing
            s.options.url = goodUrl
            await s.disconnect()

            // wait a moment
            await wait(10)
            // ensure is disconnected, not reconnecting
            expect(s.getState()).toBe('disconnected')
            expect(s.isReconnecting()).toBeFalsy()
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('stops reconnecting if disconnected while reconnecting, after some delay', async () => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            const done = Defer()
            // once disconnected due to error, actually close
            s.once('disconnected', done.resolve)
            // trigger reconnecting cycle
            s.socket?.close()
            await done
            // wait a moment
            await wait(10)
            // i.e. would reconnect if not closing
            s.options.url = goodUrl
            await s.disconnect()
            await wait(20)
            // ensure is disconnected, not reconnecting
            expect(s.getState()).toBe('disconnected')
            expect(s.isReconnecting()).toBeFalsy()
            expect(onDone).toHaveBeenCalledTimes(1)
        })
    })

    describe('send', () => {
        it('can send and receive messages', async () => {
            await s.connect()
            const done = Defer()
            s.once('message', done.resolve)

            await s.send('test')
            const { data }: any = await done
            expect(data).toEqual('test')
        })

        it('fails if not autoconnecting or manually connected', async () => {
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow('connection')
        })

        it('waits for connection if sending while connecting', async () => {
            const done = Defer()
            s.once('message', done.resolve)

            s.connect() // no await
            await s.send('test')
            const { data }: any = await done
            expect(data).toEqual('test')
        })

        it('creates connection and waits if autoconnect true', async () => {
            s.enableAutoConnect()
            const done = Defer()
            s.once('message', done.resolve)
            // no connect
            await s.send('test')
            const { data }: any = await done
            expect(data).toEqual('test')
        })

        it('waits for reconnecting if sending while reconnecting', async () => {
            await s.connect()
            const done = Defer()
            s.once('message', done.resolve)
            s.socket?.close() // will trigger reconnect
            await s.send('test')
            const { data }: any = await done
            expect(data).toEqual('test')
        })

        it('fails send if reconnect fails', async () => {
            await s.connect()
            // eslint-disable-next-line require-atomic-updates
            s.options.url = 'badurl'
            s.socket?.close()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow('Invalid URL')
        })

        it('fails send if intentionally disconnected', async () => {
            await s.connect()
            await s.disconnect()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow()
        })

        it('fails send if autoconnected but intentionally disconnected', async () => {
            s.enableAutoConnect()
            const received: Todo[] = []
            s.on('message', ({ data }: any = {}) => {
                received.push(data)
            })
            const nextMessage = Defer()
            s.once('message', nextMessage.resolve)

            await s.send('test') // ok
            await nextMessage
            expect(received).toEqual(['test'])
            await s.disconnect() // messages after this point should fail
            await expect(async () => {
                await s.send('test2')
            }).rejects.toThrow('connection')
            await wait(10)
            expect(received).toEqual(['test'])
        })

        it('connects after autoconnect enabled after disconnect', async () => {
            await s.connect()
            await s.disconnect()
            s.enableAutoConnect()
            s.enableAutoDisconnect()
            await s.addHandle(1)
            await s.send('test')
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
        })
    })

    describe('autoDisconnect', () => {
        beforeEach(() => {
            s.enableAutoDisconnect()
            s.enableAutoConnect()
        })

        it('auto-disconnects when all handles removed', async () => {
            expect(s.getState()).toBe('disconnected')
            await s.removeHandle(1) // noop
            expect(s.getState()).toBe('disconnected')
            await s.addHandle(1)
            // must have had handle previously to disconnect
            await s.removeHandle(2)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
            // can take multiple of the same handle (no error)
            await s.addHandle(1)
            expect(s.getState()).toBe('connected')
            await s.addHandle(2)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(2)
            expect(s.getState()).toBe('connected')
            // once both 1 & 2 are removed, should disconnect
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
            // can remove multiple of same handle (noop)
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
            expect(onDone).toHaveBeenCalledTimes(2)
            // should not try reconnect
            await wait(150)
            expect(onDone).toHaveBeenCalledTimes(2)
            expect(s.getState()).toBe('disconnected')
            // auto disconnect should not affect auto-connect
            expect(s.options.autoConnect).toBeTruthy()
            await s.send('test') // ok
            expect(s.getState()).toBe('disconnected')
        }, 4000)

        it('auto-disconnects when all handles removed after enabling', async () => {
            s.enableAutoDisconnect(false)
            expect(s.getState()).toBe('disconnected')
            await s.addHandle(1)
            await s.send('test')
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('connected')
            s.enableAutoDisconnect(true)
            await s.addHandle(1)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
        })

        it('handles concurrent call to removeHandle then connect', async () => {
            await s.addHandle(1)
            await Promise.all([
                s.removeHandle(1),
                s.connect(),
            ])

            expect(s.getState()).toBe('connected')
            // auto-disconnect disabled after connect
            await s.addHandle(1)
            await s.removeHandle(1)
            expect(s.getState()).toBe('connected')
            expect(s.options.autoConnect).not.toBeTruthy()
            expect(s.options.autoDisconnect).not.toBeTruthy()
        })

        it('handles concurrent call to connect then removeHandle', async () => {
            await s.connect()

            expect(s.getState()).toBe('connected')
            await s.addHandle(1)
            await Promise.all([
                s.connect(),
                s.removeHandle(1),
            ])
            expect(s.getState()).toBe('connected')
            expect(s.options.autoConnect).not.toBeTruthy()
            expect(s.options.autoDisconnect).not.toBeTruthy()
        })

        it('handles concurrent call to disconnect then removeHandle', async () => {
            await s.connect()

            expect(s.getState()).toBe('connected')
            await s.addHandle(1)
            await Promise.all([
                s.disconnect(),
                s.removeHandle(1),
            ])
            expect(s.getState()).toBe('disconnected')
            expect(s.options.autoConnect).not.toBeTruthy()
            expect(s.options.autoDisconnect).not.toBeTruthy()
        })

        it('handles concurrent call to removeHandle then disconnect', async () => {
            await s.connect()

            expect(s.getState()).toBe('connected')
            await s.addHandle(1)
            await Promise.all([
                s.removeHandle(1),
                s.disconnect(),
            ])
            expect(s.getState()).toBe('disconnected')
            expect(s.options.autoConnect).not.toBeTruthy()
            expect(s.options.autoDisconnect).not.toBeTruthy()
        })

        it('handles concurrent call to removeHandle then disconnect + connect', async () => {
            await s.connect()
            expect(s.getState()).toBe('connected')
            await s.addHandle(1)
            const tasks = Promise.all([
                expect(() => {
                    return s.disconnect()
                }).rejects.toThrow(),
                s.connect(), // this will cause disconnect call to throw
            ])
            await s.removeHandle(1)
            await tasks
            expect(s.getState()).toBe('connected')
            expect(s.options.autoConnect).not.toBeTruthy()
        })

        it('handles concurrent call to removeHandle', async () => {
            await s.connect()
            expect(s.getState()).toBe('connected')
            await s.addHandle(1)
            await Promise.all([
                s.removeHandle(1),
                s.addHandle(1),
                s.connect(),
                s.removeHandle(1),
            ])
            expect(s.getState()).toBe('connected')
            expect(s.options.autoConnect).not.toBeTruthy()
        })

        it('late disconnect', async () => {
            await s.addHandle(1)
            await s.addHandle(2)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(2)
            expect(s.getState()).toBe('connected')
            const t = s.removeHandle(1)
            await wait(0)
            await s.disconnect() // disconnect while auto-disconnecting
            await t
            expect(s.getState()).toBe('disconnected')
        })

        it('does nothing if autoDisconnect is false', async () => {
            s.enableAutoConnect()
            s.enableAutoDisconnect(false)
            await s.addHandle(1)
            expect(s.getState()).toBe('connected')
            await s.addHandle(2)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(2)
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('connected')
            expect(s.options.autoConnect).toBeTruthy()
            expect(s.options.autoDisconnect).not.toBeTruthy()
        })
    })

    describe('onTransition', () => {
        it('runs functions', async () => {
            const transitionFns = {
                onConnected: jest.fn(),
                onConnecting: jest.fn(),
                onDisconnected: jest.fn(),
                onDisconnecting: jest.fn(),
                onDone: jest.fn(),
                onError: jest.fn(),
            }

            s.onTransition(transitionFns)

            await s.connect()
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(1)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(1)
            s.socket?.close()
            await s.nextConnection()
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(1)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(1)
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(0)
            await s.disconnect()
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(1)
            expect(transitionFns.onError).toHaveBeenCalledTimes(0)

            await s.connect()
            // no more fired after disconnect done
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(1)
            expect(transitionFns.onError).toHaveBeenCalledTimes(0)
        })
    })
})
