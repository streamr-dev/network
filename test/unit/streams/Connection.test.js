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
        await s.close()
    })

    it('can open & close', async () => {
        const openTask = s.open()
        expect(s.isOpening()).toBeTruthy()
        await openTask
        expect(s.isClosed()).toBeFalsy()
        expect(s.isClosing()).toBeFalsy()
        expect(s.isOpening()).toBeFalsy()
        expect(s.isOpen()).toBeTruthy()
        const closeTask = s.close()
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
        await s.open()
        await s.open()
        expect(s.isOpen()).toBeTruthy()
        // only one open event should fire
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('can open twice in same tick', async () => {
        await Promise.all([
            s.open(),
            s.open(),
        ])
        expect(s.isOpen()).toBeTruthy()
        // only one open event should fire
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onOpening).toHaveBeenCalledTimes(1)
    })

    it('can reopen after close', async () => {
        await s.open()
        expect(s.isOpen()).toBeTruthy()
        const oldSocket = s.socket
        await s.close()
        expect(s.isClosed()).toBeTruthy()
        await s.open()
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
            await s.open()
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
            await s.open()
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
            await s.open()
        }).rejects.toThrow('Unexpected server response')
        expect(onOpen).toHaveBeenCalledTimes(0)
    })

    it('close does not error if never opened', async () => {
        expect(s.isClosed()).toBeTruthy()
        await s.close()
        expect(s.isClosed()).toBeTruthy()
        expect(onClose).toHaveBeenCalledTimes(0)
    })

    it('close does not error if already closed', async () => {
        await s.open()
        await s.close()
        expect(s.isClosed()).toBeTruthy()
        await s.close()
        expect(s.isClosed()).toBeTruthy()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('close does not error if already closing', async () => {
        await s.open()
        await Promise.all([
            s.close(),
            s.close(),
        ])
        expect(s.isClosed()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('can handle close before open complete', async () => {
        await Promise.all([
            s.open(),
            s.close()
        ])
        expect(s.isClosed()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('can handle open before close complete', async () => {
        await s.open()
        await Promise.all([
            s.close(),
            s.open()
        ])
        expect(s.isOpen()).toBeTruthy()
        expect(onOpen).toHaveBeenCalledTimes(2)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('fails if error connecting', async () => {
        await s.open()
        await Promise.all([
            s.close(),
            s.open()
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
        await s.open()
        expect(s.isOpen()).toBeTruthy()
    })

    describe('reopening', () => {
        it('reopens if unexpectedly disconnected', async (done) => {
            await s.open()
            s.once('open', () => {
                expect(s.isOpen()).toBeTruthy()
                done()
            })
            s.socket.close()
        })

        it('errors if reopen fails', async (done) => {
            await s.open()
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
            await s.open()
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
            await s.open()
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', (err) => {
                expect(err).toBeTruthy()
                done()
            })
            s.socket.close()
        })

        it('resets max retries on manual open after failure', async (done) => {
            await s.open()
            const goodUrl = s.options.url
            s.options.maxRetries = 2
            s.options.url = 'badurl'
            s.once('error', async (err) => {
                expect(err).toBeTruthy()
                s.options.url = goodUrl
                await s.open()
                setTimeout(() => {
                    expect(s.isReopening).toBeFalsy()
                    expect(s.isOpen()).toBeTruthy()
                    done()
                })
            })
            s.socket.close()
        })

        it('can try reopen after error', async () => {
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            await expect(async () => (
                s.open()
            )).rejects.toThrow('badurl')
            await s.close() // shouldn't throw
            expect(s.isClosed()).toBeTruthy()
            // ensure close
            await expect(async () => (
                Promise.all([
                    s.open(),
                    s.close(),
                ])
            )).rejects.toThrow('badurl')
            s.options.url = goodUrl
            await s.open()
            expect(s.isOpen()).toBeTruthy()
        })

        it('stops reopening if closed while reopening', async (done) => {
            await s.open()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            // once closed due to error, actually close
            s.once('close', async () => {
                // i.e. would reconnect if not closing
                s.options.url = goodUrl
                await s.close()
                // wait a moment
                setTimeout(() => {
                    // ensure is closed, not reopening
                    expect(s.isClosed()).toBeTruthy()
                    expect(s.isReopening).toBeFalsy()
                    done()
                }, 10)
            })
            // trigger reopening cycle
            s.socket.close()
        })

        it('stops reopening if closed while reopening, after some delay', async (done) => {
            await s.open()
            const goodUrl = s.options.url
            s.options.url = 'badurl'
            // once closed due to error, actually close
            s.once('close', async () => {
                // wait a moment
                setTimeout(async () => {
                    // i.e. would reconnect if not closing
                    s.options.url = goodUrl
                    await s.close()
                    setTimeout(async () => {
                        // ensure is closed, not reopening
                        expect(s.isClosed()).toBeTruthy()
                        expect(s.isReopening).toBeFalsy()
                        done()
                    }, 20)
                }, 10)
            })
            // trigger reopening cycle
            s.socket.close()
        })
    })

    describe('send', () => {
        it('can send and receive messages', async (done) => {
            await s.open()
            s.once('message', ({ data } = {}) => {
                expect(data).toEqual('test')
                done()
            })

            await s.send('test')
        })

        it('waits for reopening if sending while reopening', async (done) => {
            await s.open()
            const open = s.open.bind(s)
            s.open = async (...args) => {
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

        it('fails send if reopen fails', async () => {
            await s.open()
            // eslint-disable-next-line require-atomic-updates
            s.options.url = 'badurl'
            s.socket.close()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow('badurl')
        })

        it('fails send if intentionally closed', async () => {
            await s.open()
            await s.close()
            await expect(async () => {
                await s.send('test')
            }).rejects.toThrow()
        })
    })
})
