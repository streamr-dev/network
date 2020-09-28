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

async function collect(iterator, fn = () => {}) {
    const received = []
    for await (const msg of iterator) {
        received.push(msg)
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

const TEST_REPEATS = 5

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
        client = createClient()
        await client.connect()
        console.log = client.debug
        expectErrors = 0
        onError = jest.fn()
        stream = await client.createStream({
            name: uid('stream')
        })
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

    it('attaches listener at subscribe time', async () => {
        const M = new MessageStream(client)
        const beforeCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
        const sub = await M.subscribe(stream.id)
        const afterCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
        expect(afterCount).toBeGreaterThan(beforeCount)
        expect(M.count(stream.id)).toBe(1)
        await sub.return()
        expect(M.count(stream.id)).toBe(0)
    })

    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(`test repeat ${k + 1} of ${TEST_REPEATS}`, () => {
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
                        await sub.return()
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

                const [received1, received2] = await Promise.all([
                    collect(sub1, ({ received, iterator }) => {
                        if (received.length === published.length) {
                            iterator.return()
                        }
                    }),
                    collect(sub2, ({ received, iterator }) => {
                        if (received.length === published.length) {
                            iterator.return()
                        }
                    }),
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

                const [received1, received2] = await Promise.all([
                    collect(sub1, ({ received, iterator }) => {
                        if (received.length === published.length) {
                            iterator.return()
                        }
                    }),
                    collect(sub2, ({ received, iterator }) => {
                        if (received.length === published.length) {
                            iterator.return()
                        }
                    })
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

                const receivedMsgs = await collect(sub, ({ received, iterator }) => {
                    if (received.length === 1) {
                        iterator.return()
                    }
                })

                expect(receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
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

                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === 2) {
                        expect(unsubscribeEvents).toHaveLength(0)
                        await sub.return()
                        expect(unsubscribeEvents).toHaveLength(1)
                        expect(M.count(stream.id)).toBe(0)
                    }
                })

                expect(receivedMsgs).toHaveLength(2)
                expect(M.count(stream.id)).toBe(0)
            })

            describe('mid-stream stop methods', () => {
                let sub1
                let sub2
                let M
                let published

                beforeEach(async () => {
                    M = new MessageStream(client)
                    sub1 = await M.subscribe(stream.id)
                    sub2 = await M.subscribe(stream.id)

                    published = []
                    for (let i = 0; i < 5; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                        // eslint-disable-next-line no-await-in-loop
                        await wait(100)
                    }
                })

                it('can subscribe to stream multiple times then unsubscribe mid-stream', async () => {
                    const [received1, received2] = await Promise.all([
                        collect(sub1),
                        collect(sub2, async ({ received }) => {
                            if (received.length === 1) {
                                await M.unsubscribe(stream.id)
                            }
                        }),
                    ])
                    expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
                    expect(received2.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times then abort mid-stream', async () => {
                    let received1
                    let received2
                    await Promise.all([
                        expect(() => collect(sub1, ({ received }) => {
                            received1 = received
                        })).rejects.toThrow('abort'),
                        expect(() => collect(sub2, async ({ received }) => {
                            received2 = received
                            if (received.length === 1) {
                                await M.abort(stream.id)
                            }
                        })).rejects.toThrow('abort'),
                    ])

                    expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))
                    expect(received2.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))

                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times then return mid-stream', async () => {
                    const [received1, received2] = await Promise.all([
                        collect(sub1, async ({ received, iterator }) => {
                            if (received.length === 4) {
                                await iterator.return()
                            }
                        }),
                        collect(sub2, async ({ received, iterator }) => {
                            if (received.length === 1) {
                                await iterator.return()
                            }
                        })
                    ])

                    expect(received1.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 4))
                    expect(received2.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(0, 1))

                    expect(M.count(stream.id)).toBe(0)
                })
            })

            it('will clean up if iterator returned before start', async () => {
                const M = new MessageStream(client)
                const unsubscribeEvents = []
                client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                    unsubscribeEvents.push(m)
                })

                const sub = await M.subscribe(stream.id)
                expect(M.count(stream.id)).toBe(1)
                await sub.return()
                expect(M.count(stream.id)).toBe(0)

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
    }
})
