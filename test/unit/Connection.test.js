import { Server } from 'ws'
import { wait } from 'streamr-test-utils'
import Debug from 'debug'

import { describeRepeats } from '../utils'
import Connection from '../../src/Connection'
import { Defer } from '../../src/utils'

/* eslint-disable require-atomic-updates */

const debug = Debug('StreamrClient').extend('test')

describeRepeats('Connection', () => {
    let s
    let onConnected
    let onConnecting
    let onDisconnecting
    let onDisconnected
    let onReconnecting
    let onDone
    let onError
    let onMessage
    let wss
    let port
    let errors

    let expectErrors = 0 // check no errors by default
    beforeAll((done) => {
        wss = new Server({
            port: 0,
        }).once('listening', () => {
            port = wss.address().port
            done()
        })

        wss.on('connection', (ws) => {
            ws.on('message', (msg) => ws.send(msg))
        })
    })

    afterAll((done) => {
        wss.close(done)
    })

    beforeEach(() => {
        s = new Connection({
            url: `ws://localhost:${port}/`,
            maxRetries: 2
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
        await wait()
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
            s.socket.close()
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
                    done.resolve()
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
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(onConnected).toHaveBeenCalledTimes(1)
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
            })
            s.on('connected', onConnected)
            s.on('error', onError)
            s.on('done', onDone)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('badurl')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('rejects if cannot connect', async () => {
            s = new Connection({
                url: 'wss://streamr.network/nope',
                maxRetries: 2,
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
            await Promise.all([
                expect(async () => (
                    s.connect()
                )).rejects.toThrow(),
                new Promise((resolve, reject) => {
                    s.once('connecting', () => {
                        // purposely unchained
                        // eslint-disable-next-line promise/catch-or-return
                        wait().then(() => (
                            s.disconnect()
                        )).then(resolve, reject)
                    })
                })
            ])
            expect(s.getState()).toBe('disconnected')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onConnecting).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('can handle connect before disconnect complete', async () => {
            await s.connect()
            await Promise.all([
                new Promise((resolve, reject) => {
                    s.once('disconnecting', () => {
                        // purposely unchained
                        // eslint-disable-next-line promise/catch-or-return
                        Promise.resolve().then(() => (
                            s.connect()
                        )).then(resolve, reject)
                    })
                }),
                expect(async () => (
                    s.disconnect()
                )).rejects.toThrow(),
            ])
            expect(s.getState()).toBe('connected')
            expect(onConnected).toHaveBeenCalledTimes(1)
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
                await wait()
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

    describe('reconnecting', () => {
        it('reconnects if unexpectedly disconnected', async () => {
            await s.connect()
            s.socket.close()
            await s.nextConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected + needsConnection', async () => {
            await s.connect()
            s.socket.close()
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected while connecting', async () => {
            const connectTask = s.connect()
            s.once('connected', async () => {
                s.socket.close()
            })
            await connectTask
            expect(s.getState()).toBe('connected')
            await s.needsConnection()
            expect(s.getState()).toBe('connected')
        })

        it('reconnects if unexpectedly disconnected and autoConnect is on', async () => {
            await s.connect()
            s.enableAutoConnect()
            s.addHandle(1)
            s.socket.close()
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
            s.socket.close()
            const err = await done
            expect(err).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(s.getState()).toBe('disconnected')
            await wait()
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('throws error if reconnect fails', async () => {
            expectErrors = 1
            await s.connect()
            s.options.url = 'badurl'
            s.socket.close()
            await expect(async () => (
                s.nextConnection()
            )).rejects.toThrow('badurl')
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(s.getState()).toBe('disconnected')
            await wait()
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
                done.resolve()
            })
            s.socket.close()
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
            s.socket.close()
            const err = await done
            expect(err).toBeTruthy()
            // wait a moment for late errors
            await wait(100)
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
            s.socket.close()
            const err = await done
            expect(err).toBeTruthy()
            s.options.url = goodUrl
            await s.connect()
            await wait()
            expect(s.isReconnecting()).toBeFalsy()
            expect(s.getState()).toBe('connected')
        })

        it('can try reconnect after error', async () => {
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            await expect(async () => (
                s.connect()
            )).rejects.toThrow('badurl')
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
            s.socket.close()
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
            s.socket.close()
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
            const { data } = await done
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
            const { data } = await done
            expect(data).toEqual('test')
        })

        it('creates connection and waits if autoconnect true', async () => {
            s.enableAutoConnect()
            const done = Defer()
            s.once('message', done.resolve)
            // no connect
            await s.send('test')
            const { data } = await done
            expect(data).toEqual('test')
        })

        it('waits for reconnecting if sending while reconnecting', async () => {
            await s.connect()
            const done = Defer()
            s.once('message', done.resolve)
            s.socket.close() // will trigger reconnect
            await s.send('test')
            const { data } = await done
            expect(data).toEqual('test')
        })

        it('fails send if reconnect fails', async () => {
            await s.connect()
            // eslint-disable-next-line require-atomic-updates
            s.options.url = 'badurl'
            s.socket.close()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow('badurl')
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
            const received = []
            s.on('message', ({ data } = {}) => {
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
            await wait(100)
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
            // should not try reconnect
            await wait(1000)
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
            await wait()
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
            s.socket.close()
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

