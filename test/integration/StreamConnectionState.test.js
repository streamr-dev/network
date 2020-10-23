import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'
import MessageStream from '../../src/subscribe'

import config from './config'

describeRepeats('Connection State', () => {
    let expectErrors = 0 // check no errors by default
    let publishTestMessages
    let onError = jest.fn()
    let client
    let stream
    let M

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...config.clientOptions,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
    })

    beforeEach(async () => {
        // eslint-disable-next-line require-atomic-updates
        client = createClient()
        M = new MessageStream(client)
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        stream = await client.createStream({
            name: uid('stream')
        })

        client.debug('connecting before test <<')
        publishTestMessages = getPublishTestMessages(client, stream.id)
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test >>')
            await client.disconnect()
            client.debug('disconnecting after test <<')
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    let subs = []

    beforeEach(async () => {
        const existingSubs = subs
        subs = []
        await Promise.all(existingSubs.map((sub) => (
            sub.cancel()
        )))
    })

    it('should reconnect subscriptions when connection disconnected before subscribed & reconnected', async () => {
        await client.connect()
        const subTask = M.subscribe(stream.id)
        await true
        client.connection.socket.close()
        const published = await publishTestMessages(2)
        const sub = await subTask
        subs.push(sub)
        const received = []
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
            if (received.length === published.length) {
                expect(received).toEqual(published)
            }
            break
        }
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })

    it('should re-subscribe when subscribed then reconnected', async () => {
        await client.connect()
        const sub = await M.subscribe(stream.id)
        subs.push(sub)
        const published = await publishTestMessages(2)
        const received = []
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
            if (received.length === 2) {
                expect(received).toEqual(published)
                client.connection.socket.close()
                published.push(...(await publishTestMessages(2)))
            }

            if (received.length === 4) {
                expect(received).toEqual(published)
                break
            }
        }
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })

    it('should end when subscribed then disconnected', async () => {
        await client.connect()
        const sub = await M.subscribe(stream.id)
        subs.push(sub)
        const published = await publishTestMessages(2)
        const received = []
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
            if (received.length === 1) {
                expect(received).toEqual(published.slice(0, 1))
                client.disconnect() // should trigger break
                // no await, should be immediate
            }
        }
        expect(received).toEqual(published.slice(0, 1))
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })

    it('should end when subscribed then disconnected', async () => {
        await client.connect()
        const sub = await M.subscribe(stream.id)
        expect(client.getSubscriptions(stream.id)).toHaveLength(1)
        subs.push(sub)

        await publishTestMessages(2)
        const received = []
        await client.disconnect()
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toHaveLength(0)
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
        }
        expect(received).toEqual([])
        client.connect() // no await, should be ok
        const sub2 = await M.subscribe(stream.id)
        subs.push(sub)
        const published2 = await publishTestMessages(2)
        const received2 = []
        expect(M.count(stream.id)).toBe(1)
        expect(client.getSubscriptions(stream.id)).toHaveLength(1)
        for await (const msg of sub2) {
            received2.push(msg.getParsedContent())
            if (received2.length === 1) {
                await client.disconnect()
            }
        }
        expect(received2).toEqual(published2.slice(0, 1))
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })

    it('should just end subs when disconnected', async () => {
        await client.connect()
        const sub = await M.subscribe(stream.id)
        subs.push(sub)
        await client.disconnect()
        expect(M.count(stream.id)).toBe(0)
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })
})
