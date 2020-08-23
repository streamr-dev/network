import { wait } from 'streamr-test-utils'

import SocketConnection from '../../../src/streams/SocketConnection'

/* eslint-disable require-atomic-updates */

describe('SocketConnection', () => {
    let s
    let onOpen
    let onOpening
    let onClose
    let onError
    let onMessage

    beforeEach(() => {
        s = new SocketConnection({
            url: 'wss://echo.websocket.org/',
            maxRetries: 5
        })

        onOpen = jest.fn()
        s.on('open', onOpen)
        onOpening = jest.fn()
        s.on('opening', onOpening)
        onClose = jest.fn()
        s.on('close', onClose)
        onError = jest.fn()
        s.on('error', onError)
        onMessage = jest.fn()
        s.on('message', onMessage)
    })

    afterEach(async () => {
        await s.disconnect()
    })

    it('can open & close', async () => {
        const openTask = s.connect()
        expect(s.isOpening()).toBeTruthy()
        await openTask
        expect(s.isClosed()).toBeFalsy()
        expect(s.isClosing()).toBeFalsy()
        expect(s.isOpening()).toBeFalsy()
        expect(s.isOpen()).toBeTruthy()
        const closeTask = s.disconnect()
        expect(s.isClosing()).toBeTruthy()
        await closeTask
        expect(s.isOpen()).toBeFalsy()
        expect(s.isClosing()).toBeFalsy()
        expect(s.isOpening()).toBeFalsy()
        expect(s.isClosed()).toBeTruthy()
        // check events
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('can open after already open', async () => {
        await s.connect()
        await s.connect()
        expect(s.isOpen()).toBeTruthy()
        // only one open event should fire
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('can open twice in same tick', async () => {
        await Promise.all([
            s.connect(),
            s.connect(),
        ])
        expect(s.isOpen()).toBeTruthy()
        // only one open event should fire
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onOpening).toHaveBeenCalledTimes(1)
    })

    it('can reconnect after close', async () => {
        await s.connect()
        expect(s.isOpen()).toBeTruthy()
        const oldSocket = s.socket
        await s.disconnect()
        expect(s.isClosed()).toBeTruthy()
        await s.connect()
        expect(s.isOpen()).toBeTruthy()
        // check events
        expect(onOpen).toHaveBeenCalledTimes(2)
        expect(onClose).toHaveBeenCalledTimes(1)
        // ensure new socket
        expect(s.socket).not.toBe(oldSocket)
    })

    it('rejects if no url', async () => {
        s = new SocketConnection({
            url: undefined,
        })
        onOpen = jest.fn()
        s.on('open', onOpen)
        await expect(async () => {
            await s.connect()
        }).rejects.toThrow('not defined')
        expect(onOpen).toHaveBeenCalledTimes(0)
    })

    it('rejects if bad url', async () => {
        s = new SocketConnection({
            url: 'badurl'
        })
        onOpen = jest.fn()
        s.on('open', onOpen)
        await expect(async () => {
            await s.connect()
        }).rejects.toThrow('badurl')
        expect(onOpen).toHaveBeenCalledTimes(0)
    })

    it('rejects if cannot connect', async () => {
        s = new SocketConnection({
            url: 'wss://streamr.network/nope'
        })
        onOpen = jest.fn()
        s.on('open', onOpen)
        await expect(async () => {
            await s.connect()
        }).rejects.toThrow('Unexpected server response')
        expect(onOpen).toHaveBeenCalledTimes(0)
    })

    it('close does not error if never opened', async () => {
        expect(s.isClosed()).toBeTruthy()
        await s.disconnect()
        expect(s.isClosed()).toBeTruthy()
        expect(onClose).toHaveBeenCalledTimes(0)
    })

    it('close does not error if already closed', async () => {
        await s.connect()
        await s.disconnect()
        expect(s.isClosed()).toBeTruthy()
        await s.disconnect()
        expect(s.isClosed()).toBeTruthy()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('close does not error if already closing', async () => {
        await s.connect()
        await Promise.all([
            s.disconnect(),
            s.disconnect(),
        ])
        expect(s.isClosed()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('can handle close before open complete', async () => {
        await Promise.all([
            expect(async () => (
                s.connect()
            )).rejects.toThrow(),
            s.disconnect()
        ])
        expect(s.isClosed()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('can handle open before close complete', async () => {
        await s.connect()
        await Promise.all([
            expect(async () => (
                s.disconnect()
            )).rejects.toThrow(),
            s.connect()
        ])
        expect(s.isOpen()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(2)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('emits error but does not close if open event handler fails', async (done) => {
        const error = new Error('expected error')
        s.once('open', () => {
            throw error
        })
        s.once('error', async (err) => {
            expect(err).toBe(error)
            await wait()
            expect(s.isOpen()).toBeTruthy()
            done()
        })
        await s.connect()
        expect(s.isOpen()).toBeTruthy()
    })

    describe('reconnecting', () => {
        it('reconnects if unexpectedly disconnected', async (done) => {
            await s.connect()
            s.once('open', () => {
                expect(s.isOpen()).toBeTruthy()
                done()
            })
            s.socket.close()
        })

        it('errors if reconnect fails', async (done) => {
            await s.connect()
            s.options.url = 'badurl'
            s.once('error', (err) => {
                expect(err).toBeTruthy()
                expect(onOpen).toHaveBeenCalledTimes(1)
                expect(s.isClosed()).toBeTruthy()
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
            s.on('retry', () => {
                retryCount += 1
                // fail first 3 tries
                // pass after
                if (retryCount >= 3) {
                    s.options.url = goodUrl
                }
            })
            s.once('open', () => {
                expect(s.isOpen()).toBeTruthy()
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

        it('resets max retries on manual open after failure', async (done) => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', async (err) => {
                expect(err).toBeTruthy()
                s.options.url = goodUrl
                await s.connect()
                setTimeout(() => {
                    expect(s.isReconnecting).toBeFalsy()
                    expect(s.isOpen()).toBeTruthy()
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
            expect(s.isClosed()).toBeTruthy()
            // ensure close
            await expect(async () => (
                Promise.all([
                    s.connect(),
                    s.disconnect(),
                ])
            )).rejects.toThrow('badurl')
            s.options.url = goodUrl
            await s.connect()
            expect(s.isOpen()).toBeTruthy()
        })

        it('stops reconnecting if closed while reconnecting', async (done) => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            // once closed due to error, actually close
            s.once('close', async () => {
                // i.e. would reconnect if not closing
                s.options.url = goodUrl
                await s.disconnect()
                // wait a moment
                setTimeout(() => {
                    // ensure is closed, not reconnecting
                    expect(s.isClosed()).toBeTruthy()
                    expect(s.isReconnecting).toBeFalsy()
                    done()
                }, 10)
            })
            // trigger reconnecting cycle
            s.socket.close()
        })

        it('stops reconnecting if closed while reconnecting, after some delay', async (done) => {
            await s.connect()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            // once closed due to error, actually close
            s.once('close', async () => {
                // wait a moment
                setTimeout(async () => {
                    // i.e. would reconnect if not closing
                    s.options.url = goodUrl
                    await s.disconnect()
                    setTimeout(async () => {
                        // ensure is closed, not reconnecting
                        expect(s.isClosed()).toBeTruthy()
                        expect(s.isReconnecting).toBeFalsy()
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
            const open = s.connect.bind(s)
            s.connect = async (...args) => {
                await wait(0)
                return open(...args)
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

        it('fails send if intentionally closed', async () => {
            await s.connect()
            await s.disconnect()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow()
        })
    })
})
