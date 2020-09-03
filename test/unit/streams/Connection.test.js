import { wait } from 'streamr-test-utils'
import Debug from 'debug'

import SocketConnection from '../../../src/streams/SocketConnection'

/* eslint-disable require-atomic-updates */

const debug = Debug('StreamrClient').extend('test')

describe('SocketConnection', () => {
    let s
    let onConnected
    let onConnecting
    let onDisconnecting
    let onDisconnected
    let onReconnecting
    let onError
    let onMessage

    let expectErrors = 0 // check no errors by default

    beforeEach(() => {
        jest.setTimeout(2000)
        s = new SocketConnection({
            url: 'wss://echo.websocket.org/',
            maxRetries: 2
        })

        onConnected = jest.fn()
        s.on('connected', onConnected)
        onConnecting = jest.fn()
        s.on('connecting', onConnecting)
        onDisconnected = jest.fn()
        s.on('disconnected', onDisconnected)
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
        expect(onError).toHaveBeenCalledTimes(expectErrors)
    })

    afterEach(async () => {
        debug('disconnecting after test')
        await s.disconnect()
        if (SocketConnection.getOpen() !== 0) {
            throw new Error('not closed')
        }
        await wait(1000)
    })

    describe('basics', () => {
        it('can connect & disconnect', async () => {
            const connectTask = s.connect()
            expect(s.isConnecting()).toBeTruthy()
            await connectTask
            expect(s.isDisconnected()).toBeFalsy()
            expect(s.isDisconnecting()).toBeFalsy()
            expect(s.isConnecting()).toBeFalsy()
            expect(s.isConnected()).toBeTruthy()
            const disconnectTask = s.disconnect()
            expect(s.isDisconnecting()).toBeTruthy()
            await disconnectTask
            expect(s.isConnected()).toBeFalsy()
            expect(s.isDisconnecting()).toBeFalsy()
            expect(s.isConnecting()).toBeFalsy()
            expect(s.isDisconnected()).toBeTruthy()
            // check events
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
        })

        it('can connect after already connected', async () => {
            await s.connect()
            await s.connect()
            expect(s.isConnected()).toBeTruthy()

            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
        })

        it('can connect twice in same tick', async () => {
            await Promise.all([
                s.connect(),
                s.connect(),
            ])
            expect(s.isConnected()).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onConnecting).toHaveBeenCalledTimes(1)
        })

        it('fires all events once if connected twice in same tick', async () => {
            await Promise.all([
                s.connect(),
                s.connect(),
            ])
            expect(s.isConnected()).toBeTruthy()
            await Promise.all([
                s.disconnect(),
                s.disconnect(),
            ])
            expect(s.isDisconnected()).toBeTruthy()

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

            expect(s.isConnected()).toBeTruthy()

            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            expect(onDisconnecting).toHaveBeenCalledTimes(0)
            expect(onConnecting).toHaveBeenCalledTimes(2)
        })

        it('can connect again after disconnect', async () => {
            await s.connect()
            expect(s.isConnected()).toBeTruthy()
            const oldSocket = s.socket
            await s.disconnect()
            expect(s.isDisconnected()).toBeTruthy()
            await s.connect()
            expect(s.isConnected()).toBeTruthy()
            // check events
            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
            // ensure new socket
            expect(s.socket).not.toBe(oldSocket)
        })

        describe('connect/disconnect inside event handlers', () => {
            it('can handle disconnect on connecting event', async (done) => {
                expectErrors = 1
                s.once('connecting', async () => {
                    await s.disconnect()
                    expect(s.isDisconnected()).toBeTruthy()
                    done()
                })
                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.isDisconnected()).toBeTruthy()
            })

            it('can handle disconnect on connected event', async (done) => {
                expectErrors = 1
                s.once('connected', async () => {
                    await s.disconnect()
                    expect(s.isDisconnected()).toBeTruthy()
                    done()
                })

                await expect(async () => {
                    await s.connect()
                }).rejects.toThrow()
                expect(s.isConnected()).toBeFalsy()
            })

            it('can handle connect on disconnecting event', async (done) => {
                expectErrors = 1
                s.once('disconnecting', async () => {
                    await s.connect()
                    expect(s.isConnected()).toBeTruthy()
                    done()
                })
                await s.connect()
                await expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow()
                expect(s.isDisconnected()).toBeFalsy()
            })

            it('can handle connect on disconnected event', async (done) => {
                expectErrors = 1
                await s.connect()

                s.once('disconnected', async () => {
                    await s.connect()
                    s.debug('connect done')
                    expect(s.isConnected()).toBeTruthy()
                    done()
                })

                await expect(async () => {
                    await s.disconnect()
                }).rejects.toThrow()
                expect(s.isConnected()).toBeFalsy()
            })
        })

        it('rejects if no url', async () => {
            expectErrors = 1
            s = new SocketConnection({
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
            s = new SocketConnection({
                url: 'badurl',
                maxRetries: 2,
            })
            onConnected = jest.fn()
            s.on('connected', onConnected)
            onError = jest.fn()
            s.on('error', onError)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('badurl')
            expect(onConnected).toHaveBeenCalledTimes(0)
        })

        it('rejects if cannot connect', async () => {
            expectErrors = 1
            s = new SocketConnection({
                url: 'wss://streamr.network/nope',
                maxRetries: 2,
            })
            onConnected = jest.fn()
            s.on('connected', onConnected)
            onError = jest.fn()
            s.on('error', onError)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow('Unexpected server response')
            expect(onConnected).toHaveBeenCalledTimes(0)
        })

        it('disconnect does not error if never connected', async () => {
            expect(s.isDisconnected()).toBeTruthy()
            await s.disconnect()
            expect(s.isDisconnected()).toBeTruthy()
            expect(onDisconnected).toHaveBeenCalledTimes(0)
        })

        it('disconnect does not error if already disconnected', async () => {
            await s.connect()
            await s.disconnect()
            expect(s.isDisconnected()).toBeTruthy()
            await s.disconnect()
            expect(s.isDisconnected()).toBeTruthy()
            expect(onDisconnected).toHaveBeenCalledTimes(1)
        })

        it('disconnect does not error if already closing', async () => {
            await s.connect()
            await Promise.all([
                s.disconnect(),
                s.disconnect(),
            ])
            expect(s.isDisconnected()).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
        })

        it('can handle disconnect before connect complete', async () => {
            expectErrors = 1
            await Promise.all([
                expect(async () => (
                    s.connect()
                )).rejects.toThrow(),
                s.disconnect()
            ])
            expect(s.isDisconnected()).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(0)
            expect(onDisconnected).toHaveBeenCalledTimes(0)
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
            expect(s.isConnected()).toBeTruthy()
            expect(onConnected).toHaveBeenCalledTimes(2)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
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
                expect(s.isConnected()).toBeTruthy()
                done()
            })
            await s.connect()
            expect(s.isConnected()).toBeTruthy()
        })
    })

    describe('triggerConnectionOrWait', () => {
        it('connects if no autoconnect', async () => {
            s.options.autoConnect = false
            const task = s.triggerConnectionOrWait()
            expect(s.isDisconnected()).toBeTruthy()
            await wait(20)
            await Promise.all([
                task,
                s.connect()
            ])
            expect(s.isConnected()).toBeTruthy()
        })

        it('connects if autoconnect', async () => {
            s.options.autoConnect = true
            await s.triggerConnectionOrWait()
            expect(s.isConnected()).toBeTruthy()
        })

        it('errors if connect errors', async () => {
            expectErrors = 1
            s.options.autoConnect = true
            s.options.url = 'badurl'
            await expect(async () => {
                await s.triggerConnectionOrWait()
            }).rejects.toThrow()
            expect(s.isDisconnected()).toBeTruthy()
        })

        it('errors if connect errors without autoconnect', async () => {
            expectErrors = 1
            s.options.autoConnect = false
            s.options.url = 'badurl'
            const task = s.triggerConnectionOrWait()
            await wait(20)
            await expect(async () => {
                await s.connect()
            }).rejects.toThrow()
            await expect(task).rejects.toThrow()
            expect(s.isDisconnected()).toBeTruthy()
        })
    })

    describe('reconnecting', () => {
        it('reconnects if unexpectedly disconnected', async (done) => {
            await s.connect()
            s.once('connected', () => {
                expect(s.isConnected()).toBeTruthy()
                done()
            })
            s.socket.close()
        })

        it('errors if reconnect fails', async (done) => {
            expectErrors = 1
            await s.connect()
            s.options.url = 'badurl'
            s.on('error', async (err) => {
                expect(err).toBeTruthy()
                expect(onConnected).toHaveBeenCalledTimes(1)
                expect(s.isDisconnected()).toBeTruthy()
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
                expect(s.isConnected()).toBeTruthy()
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
                done()
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
                    expect(s.isConnected()).toBeTruthy()
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
            expect(s.isDisconnected()).toBeTruthy()
            // ensure close
            await expect(async () => (
                Promise.all([
                    s.connect(),
                    s.disconnect(),
                ])
            )).rejects.toThrow('badurl')
            s.options.url = goodUrl
            await s.connect()
            expect(s.isConnected()).toBeTruthy()
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
                    expect(s.isDisconnected()).toBeTruthy()
                    expect(s.isReconnecting()).toBeFalsy()
                    done()
                }, 10)
            })
            // trigger reconnecting cycle
            s.socket.close()
        })

        it('stops reconnecting if disconnected while reconnecting, after some delay', async (done) => {
            await s.connect()
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
                        expect(s.isDisconnected()).toBeTruthy()
                        expect(s.isReconnecting()).toBeFalsy()
                        done()
                    }, 20)
                }, 10)
            })
            // trigger reconnecting cycle
            s.socket.close()
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
    })
})

