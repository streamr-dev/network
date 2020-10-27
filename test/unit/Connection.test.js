import { Server } from 'ws'
import { wait } from 'streamr-test-utils'
import Debug from 'debug'

import Connection from '../../src/Connection'

/* eslint-disable require-atomic-updates */

const debug = Debug('StreamrClient').extend('test')

describe('Connection', () => {
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
        onError = jest.fn()
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
            expect(onError).toHaveBeenCalledTimes(expectErrors)
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
            const connectTask = s.connect()
            expect(s.getState()).toBe('connecting')
            await connectTask
            expect(s.getState()).toBe('connected')
            const disconnectTask = s.disconnect()
            expect(s.getState()).toBe('disconnecting')
            await disconnectTask
            expect(s.getState()).toBe('disconnected')
            // check events
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
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
            expect(onDisconnecting).toHaveBeenCalledTimes(0)
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
            it('can handle connect on connecting event', async (done) => {
                s.once('connecting', async () => {
                    await s.connect()
                    expect(s.getState()).toBe('connected')
                    expect(onConnected).toHaveBeenCalledTimes(1)
                    expect(onConnecting).toHaveBeenCalledTimes(1)
                    done()
                })
                await s.connect()
                expect(s.getState()).toBe('connected')
            })

            it('can handle disconnect on connecting event', async (done) => {
                expectErrors = 1
                s.once('connecting', async () => {
                    await s.disconnect()
                    expect(s.getState()).toBe('disconnected')
                    expect(onDone).toHaveBeenCalledTimes(1)
                    done()
                })
                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.getState()).toBe('disconnected')
            })

            it('can handle disconnect on connected event', async (done) => {
                expectErrors = 1
                s.once('connected', async () => {
                    await s.disconnect()
                    expect(s.getState()).toBe('disconnected')
                    expect(onDone).toHaveBeenCalledTimes(1)
                    done()
                })

                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.getState()).not.toBe('connected')
            })

            it('can handle disconnect on connected event, repeated', async (done) => {
                expectErrors = 3
                s.once('connected', async () => {
                    await expect(async () => {
                        await s.disconnect()
                    }).rejects.toThrow()
                })
                s.once('disconnected', async () => {
                    s.once('connected', async () => {
                        await s.disconnect()
                        expect(onDone).toHaveBeenCalledTimes(1)
                        done()
                    })

                    await expect(async () => {
                        await s.connect()
                    }).rejects.toThrow()
                })
                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
            })

            it('can handle connect on disconnecting event', async (done) => {
                expectErrors = 1
                s.once('disconnecting', async () => {
                    await s.connect()
                    expect(s.getState()).toBe('connected')
                    done()
                })
                await s.connect()
                await expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow()
                expect(onDone).toHaveBeenCalledTimes(0)
                expect(s.getState()).not.toBe('disconnected')
            })

            it('can handle connect on disconnected event', async (done) => {
                expectErrors = 1
                await s.connect()

                s.once('disconnected', async () => {
                    await s.connect()
                    s.debug('connect done')
                    expect(s.getState()).toBe('connected')
                    expect(onDone).toHaveBeenCalledTimes(0)
                    done()
                })

                await expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow()
                expect(s.getState()).not.toBe('connected')
            })
        })

        it('rejects if no url', async () => {
            expectErrors = 1
            s = new Connection({
                url: undefined,
                maxRetries: 2,
            })
            onConnected = jest.fn()
            s.on('connected', onConnected)
            onError = jest.fn()
            s.on('error', onError)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('not defined')
            expect(onConnected).toHaveBeenCalledTimes(0)
        })

        it('rejects if bad url', async () => {
            expectErrors = 1
            s = new Connection({
                url: 'badurl',
                maxRetries: 2,
            })
            onConnected = jest.fn()
            s.on('connected', onConnected)
            onError = jest.fn()
            s.on('error', onError)
            s.on('done', onDone)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('badurl')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('rejects if cannot connect', async () => {
            expectErrors = 1
            s = new Connection({
                url: 'wss://streamr.network/nope',
                maxRetries: 2,
            })
            onConnected = jest.fn()
            s.on('connected', onConnected)
            s.on('done', onDone)
            onError = jest.fn()
            s.on('error', onError)
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
            expectErrors = 1
            await Promise.all([
                expect(async () => (
                    s.connect()
                )).rejects.toThrow(),
                s.disconnect()
            ])
            expect(s.getState()).toBe('disconnected')
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDisconnected).toHaveBeenCalledTimes(0)
            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('can handle connect before disconnect complete', async () => {
            expectErrors = 1
            await s.connect()
            await Promise.all([
                expect(async () => (
                    s.disconnect()
                )).rejects.toThrow(),
                s.connect()
            ])
            expect(s.getState()).toBe('connected')
            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDone).toHaveBeenCalledTimes(0)
        })

        it('emits error but does not disconnect if connect event handler fails', async (done) => {
            expectErrors = 1
            const error = new Error('expected error')
            s.once('connected', () => {
                throw error
            })
            s.once('error', async (err) => {
                expect(err).toBe(error)
                await wait()
                expect(s.getState()).toBe('connected')
                done()
            })
            await s.connect()
            expect(s.getState()).toBe('connected')
            expect(onDone).toHaveBeenCalledTimes(0)
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

        it('works with autoConnect', async () => {
            s.options.autoConnect = true
            expect(s.isConnectionValid()).toBeTruthy()
        })

        it('works with autoDisconnect', async () => {
            s.options.autoConnect = true
            s.options.autoDisconnect = true
            expect(s.isConnectionValid()).toBeTruthy()
            await s.addHandle(1)
            expect(s.isConnectionValid()).toBeTruthy()
            await s.removeHandle(1)
            expect(s.isConnectionValid()).toBeTruthy()
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
            expect(resolved).toBe(true)
            await next
        })

        it('rejects on next error', async () => {
            expectErrors = 1
            let errored = false
            s.options.url = 'badurl'
            const next = s.nextConnection().catch((err) => {
                errored = true
                throw err
            })
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow()
            expect(errored).toBe(true)
            await expect(async () => {
                await next
            }).rejects.toThrow()
        })

        it('rejects if disconnected while connecting', async () => {
            expectErrors = 1
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
            expect(errored).toBe(true)
            await expect(async () => {
                await next
            }).rejects.toThrow()
        })
    })

    describe('reconnecting', () => {
        it('reconnects if unexpectedly disconnected', async (done) => {
            await s.connect()
            s.once('connected', () => {
                expect(s.getState()).toBe('connected')
                done()
            })
            s.socket.close()
        })

        it('errors if reconnect fails', async (done) => {
            expectErrors = 1
            await s.connect()
            s.options.url = 'badurl'
            s.once('error', async (err) => {
                expect(err).toBeTruthy()
                expect(onConnected).toHaveBeenCalledTimes(1)
                expect(s.getState()).toBe('disconnected')
                expect(onDone).toHaveBeenCalledTimes(1)
                done()
            })
            s.socket.close()
        })

        it('retries multiple times when disconnected', async (done) => {
            s.options.maxRetries = 3
            /* eslint-disable no-underscore-dangle */
            await s.connect()
            const goodUrl = s.options.url
            let retryCount = 0
            s.options.url = 'badurl'
            s.on('reconnecting', () => {
                retryCount += 1
                // fail first 3 tries
                // pass after
                if (retryCount >= 3) {
                    s.options.url = goodUrl
                }
            })
            s.once('connected', () => {
                expect(s.getState()).toBe('connected')
                expect(retryCount).toEqual(3)
                done()
            })
            s.socket.close()
            /* eslint-enable no-underscore-dangle */
        }, 3000)

        it('fails if exceed max retries', async (done) => {
            expectErrors = 1
            await s.connect()
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', (err) => {
                expect(err).toBeTruthy()
                // wait a moment for late errors
                setTimeout(() => {
                    expect(onDone).toHaveBeenCalledTimes(1)
                    done()
                }, 100)
            })
            s.socket.close()
        })

        it('resets max retries on manual connect after failure', async (done) => {
            expectErrors = 1
            await s.connect()
            const goodUrl = s.options.url
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', async (err) => {
                expect(err).toBeTruthy()
                s.options.url = goodUrl
                await s.connect()
                setTimeout(() => {
                    expect(s.isReconnecting()).toBeFalsy()
                    expect(s.getState()).toBe('connected')
                    done()
                })
            })
            s.socket.close()
        })

        it('can try reconnect after error', async () => {
            expectErrors = 2
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            await expect(async () => (
                s.connect()
            )).rejects.toThrow('badurl')
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
            expect(onDone).toHaveBeenCalledTimes(2)
            s.options.url = goodUrl
            await s.connect()
            expect(s.getState()).toBe('connected')
        })

        it('stops reconnecting if disconnected while reconnecting', async (done) => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            // once disconnected due to error, actually close
            s.once('disconnected', async () => {
                // i.e. would reconnect if not closing
                s.options.url = goodUrl
                await s.disconnect()
                // wait a moment
                setTimeout(() => {
                    // ensure is disconnected, not reconnecting
                    expect(s.getState()).toBe('disconnected')
                    expect(s.isReconnecting()).toBeFalsy()
                    expect(onDone).toHaveBeenCalledTimes(1)
                    done()
                }, 10)
            })
            // trigger reconnecting cycle
            s.socket.close()
        })

        it('stops reconnecting if disconnected while reconnecting, after some delay', (done) => {
            s.connect().then(() => {
                const goodUrl = s.options.url
                s.options.url = 'badurl'
                // once disconnected due to error, actually close
                s.once('disconnected', async () => {
                    // wait a moment
                    setTimeout(async () => {
                        // i.e. would reconnect if not closing
                        s.options.url = goodUrl
                        await s.disconnect()
                        setTimeout(async () => {
                            // ensure is disconnected, not reconnecting
                            expect(s.getState()).toBe('disconnected')
                            expect(s.isReconnecting()).toBeFalsy()
                            expect(onDone).toHaveBeenCalledTimes(1)
                            done()
                        }, 20)
                    }, 10)
                })
                // trigger reconnecting cycle
                s.socket.close()
            })
        })
    })

    describe('send', () => {
        it('can send and receive messages', async (done) => {
            await s.connect()
            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })

            await s.send('test')
        })

        it('fails if not autoconnecting or manually connected', async () => {
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow('connection')
        })

        it('waits for connection if sending while connecting', async (done) => {
            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })

            s.connect() // no await
            await s.send('test')
        })

        it('creates connection and waits if autoconnect true', async (done) => {
            s.options.autoConnect = true
            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })
            // no connect
            await s.send('test')
        })

        it('waits for reconnecting if sending while reconnecting', async (done) => {
            await s.connect()

            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })

            s.socket.close()
            await s.send('test')
        })

        it('fails send if reconnect fails', async () => {
            expectErrors = 2 // one for auto-reconnect, one for send reconnect
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
            s.options.autoConnect = true
            const received = []
            s.on('message', ({ data } = {}) => {
                received.push(data)
            })

            const nextMessage = new Promise((resolve) => s.once('message', resolve))
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
    })

    describe('autoDisconnect', () => {
        it('auto-disconnects when all handles removed', async () => {
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            expect(s.getState()).toBe('connected')
        })

        it('auto-disconnects when all handles removed without explicit connect', async () => {
            s.options.autoDisconnect = true
            s.options.autoConnect = true
            expect(s.getState()).toBe('disconnected')
            await s.addHandle(1)
            await s.send('test')
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
            await s.addHandle(1)
            await s.send('test')
            expect(s.getState()).toBe('connected')
            await s.removeHandle(1)
            expect(s.getState()).toBe('disconnected')
            await s.send('test')
            expect(s.getState()).toBe('connected')
        })

        it('handles concurrent call to removeHandle then connect', async () => {
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
            await s.connect()
            expectErrors = 1
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = true
            s.options.autoConnect = true
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
            s.options.autoDisconnect = false
            s.options.autoConnect = true
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
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(0)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(1)
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(0)
            await s.disconnect()
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(1)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(1)
            expect(transitionFns.onError).toHaveBeenCalledTimes(0)

            await s.connect()
            // no more fired after disconnect done
            expect(transitionFns.onConnecting).toHaveBeenCalledTimes(2)
            expect(transitionFns.onConnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDisconnecting).toHaveBeenCalledTimes(1)
            expect(transitionFns.onDisconnected).toHaveBeenCalledTimes(2)
            expect(transitionFns.onDone).toHaveBeenCalledTimes(1)
            expect(transitionFns.onError).toHaveBeenCalledTimes(0)
        })
    })
})

