import { wait } from 'streamr-test-utils'

import SocketConnection from '../../../src/streams/SocketConnection'

describe('SocketConnection', () => {
    let s
    let onOpen
    let onClose
    let onError
    let onMessage

    beforeEach(() => {
        s = new SocketConnection({
            url: 'wss://echo.websocket.org/'
        })

        onOpen = jest.fn()
        s.on('open', onOpen)
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
        // eslint-disable-next-line require-atomic-updates
        s.options.url = goodUrl
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

        it('fails if reopen fails', async (done) => {
            await s.open()
            // eslint-disable-next-line require-atomic-updates
            s.options.url = 'badurl'
            s.once('error', (err) => {
                expect(err).toBeTruthy()
                expect(onOpen).toHaveBeenCalledTimes(1)
                expect(s.isClosed()).toBeTruthy()
                done()
            })
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
