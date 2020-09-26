import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'
import MessageStream from '../../src/Stream'

import config from './config'

const { ControlMessage } = ControlLayer

const Msg = (opts) => ({
    value: uid('msg'),
    ...opts,
})

describe('StreamrClient Stream', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client
    let stream

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
        client = createClient()

        stream = await client.createStream({
            name: uid('stream')
        })
        await client.connect()
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
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    it('can subscribe to stream and get updates then auto unsubscribe', async () => {
        const M = new MessageStream(client)
        const sub = await M.subscribe(stream.id)
        expect(M.count(stream.id)).toBe(1)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const received = []
        for await (const m of sub) {
            received.push(m)
            if (received.length === published.length) {
                sub.return()
            }
        }

        expect(received.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published)
        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream multiple times, get updates then unsubscribe', async () => {
        const M = new MessageStream(client)
        const sub1 = await M.subscribe(stream.id)
        const sub2 = await M.subscribe(stream.id)

        expect(M.count(stream.id)).toBe(2)
        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        async function subscribe(s) {
            const received = []
            for await (const m of s) {
                received.push(m)
                if (received.length === published.length) {
                    s.return()
                }
            }
            return received
        }

        const [received1, received2] = await Promise.all([
            subscribe(sub1),
            subscribe(sub2),
        ])

        expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published)
        expect(received2).toEqual(received1)
        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream multiple times in parallel, get updates then unsubscribe', async () => {
        const M = new MessageStream(client)
        const [sub1, sub2] = await Promise.all([
            M.subscribe(stream.id),
            M.subscribe(stream.id),
        ])

        expect(M.count(stream.id)).toBe(2)
        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        async function subscribe(s) {
            const received = []
            for await (const m of s) {
                received.push(m)
                if (received.length === published.length) {
                    s.return()
                }
            }
            return received
        }

        const [received1, received2] = await Promise.all([
            subscribe(sub1),
            subscribe(sub2),
        ])

        expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published)
        expect(received2).toEqual(received1)
        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream and get some updates then unsubscribe mid-stream', async () => {
        const M = new MessageStream(client)
        const sub = await M.subscribe(stream.id)
        expect(M.count(stream.id)).toBe(1)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const received = []
        for await (const m of sub) {
            received.push(m)
            if (received.length === 1) {
                await M.unsubscribe(stream.id)
            }
        }

        expect(received.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
        expect(M.count(stream.id)).toBe(0)
    })

    it('finishes unsubscribe before returning', async () => {
        const unsubscribeEvents = []
        client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
            unsubscribeEvents.push(m)
        })

        const M = new MessageStream(client)
        const sub = await M.subscribe(stream.id)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const received = []
        for await (const m of sub) {
            received.push(m)
            if (received.length === 2) {
                expect(unsubscribeEvents).toHaveLength(0)
                await sub.return()
                expect(unsubscribeEvents).toHaveLength(1)
                expect(M.count(stream.id)).toBe(0)
            }
        }
        expect(received).toHaveLength(2)

        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream multiple times then unsubscribe mid-stream', async () => {
        const M = new MessageStream(client)
        const sub1 = await M.subscribe(stream.id)
        const sub2 = await M.subscribe(stream.id)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        async function subscribe(s, doUnsub) {
            const received = []
            for await (const m of s) {
                received.push(m)
                if (doUnsub === received.length) {
                    await M.unsubscribe(stream.id)
                }
            }
            return received
        }

        const [received1, received2] = await Promise.all([
            subscribe(sub1),
            subscribe(sub2, 2),
        ])

        expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 3))
        expect(received2.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 2))
        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream multiple times then abort mid-stream', async () => {
        const M = new MessageStream(client)
        const sub1 = await M.subscribe(stream.id)
        const sub2 = await M.subscribe(stream.id)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        async function subscribe(s, doUnsub) {
            const received = []
            for await (const m of s) {
                received.push(m)
                if (doUnsub === received.length) {
                    await M.abort(stream.id)
                }
            }
            return received
        }

        await Promise.all([
            expect(() => subscribe(sub1)).rejects.toThrow('abort'),
            expect(() => subscribe(sub2, 2)).rejects.toThrow('abort'),
        ])

        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe to stream multiple times then return mid-stream', async () => {
        const M = new MessageStream(client)
        const sub1 = await M.subscribe(stream.id)
        const sub2 = await M.subscribe(stream.id)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        async function subscribe(s, doUnsub) {
            const received = []
            for await (const m of s) {
                received.push(m)
                if (doUnsub === received.length) {
                    return received
                }
            }
            return received
        }

        const [received1, received2] = await Promise.all([
            subscribe(sub1, 1),
            subscribe(sub2, 4),
        ])

        expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
        expect(received2.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 4))

        expect(M.count(stream.id)).toBe(0)
    })

    it('will clean up if iterator returned before start', async () => {
        const unsubscribeEvents = []
        client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
            unsubscribeEvents.push(m)
        })

        const M = new MessageStream(client)
        const sub = await M.subscribe(stream.id)
        expect(M.count(stream.id)).toBe(1)
        await sub.return()
        expect(M.count(stream.id)).toBe(0)

        const published = []
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const received = []
        for await (const m of sub) {
            received.push(m)
        }
        expect(received).toHaveLength(0)
        expect(unsubscribeEvents).toHaveLength(1)

        expect(M.count(stream.id)).toBe(0)
    })

    it('can subscribe then unsubscribe in parallel', async () => {
        const unsubscribeEvents = []
        client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
            unsubscribeEvents.push(m)
        })
        const M = new MessageStream(client)
        const [sub] = await Promise.all([
            M.subscribe(stream.id),
            M.unsubscribe(stream.id),
        ])

        const published = []
        for (let i = 0; i < 2; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const received = []
        for await (const m of sub) {
            received.push(m)
        }

        // shouldn't get any messages
        expect(received).toHaveLength(0)
        expect(unsubscribeEvents).toHaveLength(1)
        expect(M.count(stream.id)).toBe(0)
    })
})
