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
        if (!s.isClosed()) {
            await s.close()
        }
    })

    it('can open & close', async () => {
        await s.open()
        expect(s.isOpen()).toBeTruthy()
        await s.close()
        expect(s.isOpen()).toBeFalsy()
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

    it('reconnects if unexpectedly disconnected', async (done) => {
        await s.open()
        s.once('open', () => {
            expect(s.isOpen()).toBeTruthy()
            done()
        })
        s.socket.close()
    })

    it('can send and receive messages', async (done) => {
        await s.open()
        s.on('message', ({ data } = {}) => {
            expect(data).toEqual('test')
            done()
        })

        await s.send('test')
    })
})
