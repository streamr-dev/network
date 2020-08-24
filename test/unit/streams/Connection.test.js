import { wait } from 'streamr-test-utils'

import SocketConnection from '../../../src/streams/SocketConnection'

/* eslint-disable require-atomic-updates */

describe('SocketConnection', () => {
    let s
    let onConnected
    let onConnecting
    let onDisconnecting
    let onDisconnected
    let onReconnecting
    let onError
    let onMessage

    beforeEach(() => {
        s = new SocketConnection({
            url: 'wss://echo.websocket.org/',
            maxRetries: 5
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
    })

    afterEach(async () => {
        await s.disconnect()
    })

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
        // only one connect event should fire
        expect(onConnected).toHaveBeenCalledTimes(1)
    })

    it('can connect twice in same tick', async () => {
        await Promise.all([
            s.connect(),
            s.connect(),
        ])
        expect(s.isConnected()).toBeTruthy()
        // only one connect event should fire
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
        // only one connect event should fire
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
        await s.connect()

        expect(s.isConnected()).toBeTruthy()

        // only one connect event should fire
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

    it('rejects if no url', async () => {
        s = new SocketConnection({
            url: undefined,
        })
        onConnected = jest.fn()
        s.on('connected', onConnected)
        await expect(async () => {
            await s.connect()
        }).rejects.toThrow('not defined')
        expect(onConnected).toHaveBeenCalledTimes(0)
    })

    it('rejects if bad url', async () => {
        s = new SocketConnection({
            url: 'badurl'
        })
        onConnected = jest.fn()
        s.on('connected', onConnected)
        await expect(async () => {
            await s.connect()
        }).rejects.toThrow('badurl')
        expect(onConnected).toHaveBeenCalledTimes(0)
    })

    it('rejects if cannot connect', async () => {
        s = new SocketConnection({
            url: 'wss://streamr.network/nope'
        })
        onConnected = jest.fn()
        s.on('connected', onConnected)
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
        await Promise.all([
            expect(async () => (
                s.connect()
            )).rejects.toThrow(),
            s.disconnect()
        ])
        expect(s.isDisconnected()).toBeTruthy()
        expect(onConnected).toHaveBeenCalledTimes(1)
        expect(onDisconnected).toHaveBeenCalledTimes(1)
    })

    it('can handle connect before disconnect complete', async () => {
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
            await s.connect()
            s.options.url = 'badurl'
            s.once('error', (err) => {
                expect(err).toBeTruthy()
                expect(onConnected).toHaveBeenCalledTimes(1)
                expect(s.isDisconnected()).toBeTruthy()
                done()
            })
            s.socket.close()
        })

        it('retries multiple times when disconnected', async (done) => {
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
        })

        it('fails if exceed max retries', async (done) => {
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

        it('waits for reconnecting if sending while reconnecting', async (done) => {
            await s.connect()
            const connect = s.connect.bind(s)
            s.connect = async (...args) => {
                await wait(0)
                return connect(...args)
            }

            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })

            s.socket.close()
            await s.send('test')
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
    })
})
