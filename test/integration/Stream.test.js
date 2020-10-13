import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'
import Debug from 'debug'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'
import { pTimeout } from '../../src/iterators'
import { Defer } from '../../src/utils'
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
        received.push(msg.getParsedContent())
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

const TEST_REPEATS = 3

console.log = Debug('Streamr::   CONSOLE   ')

describe('StreamrClient Stream', () => {
    let expectErrors = 0 // check no errors by default
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

    beforeAll(async () => {
        if (client) {
            await client.disconnect()
        }
    })

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
    })

    beforeEach(async () => {
        // eslint-disable-next-line require-atomic-updates
        client = createClient()
        M = new MessageStream(client)
        await pTimeout(client.connect(), 4500, 'client.connect')
    })

    beforeEach(async () => {
        stream = await pTimeout(client.createStream({
            name: uid('stream')
        }), 10000, 'createStream')

        await wait(250) // prevent timing issues
    }, 11000)

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
            await pTimeout(client.disconnect(), 4500, 'client.disconnect')
            client.debug('disconnected after test')
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    it('attaches listener at subscribe time', async () => {
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
            describe('basics', () => {
                it('can subscribe to stream and get updates then auto unsubscribe', async () => {
                    const sub = await M.subscribe(stream.id)
                    expect(M.count(stream.id)).toBe(1)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }

                    const received = []
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === published.length) {
                            return
                        }
                    }
                    expect(received).toEqual(published)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('subscribes immediately', async () => {
                    const sub = await M.subscribe(stream.id)

                    expect(M.count(stream.id)).toBe(1)
                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }

                    const received = []
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === published.length) {
                            return
                        }
                    }
                    expect(received).toEqual(published)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can kill stream using async end', async () => {
                    const sub = await M.subscribe(stream.id)
                    expect(M.count(stream.id)).toBe(1)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }

                    let t
                    let expectedLength
                    const received = []
                    try {
                        for await (const m of sub) {
                            received.push(m)
                            // after first message schedule end
                            if (received.length === 1) {
                                // eslint-disable-next-line no-loop-func
                                t = setTimeout(() => {
                                    expectedLength = received.length
                                    // should not see any more messages after end
                                    sub.cancel()
                                })
                            }
                        }
                    } finally {
                        clearTimeout(t)
                    }
                    // gets some messages but not all
                    expect(received).toHaveLength(expectedLength)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can kill stream with throw', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })
                    const sub = await M.subscribe(stream.id)
                    expect(M.count(stream.id)).toBe(1)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }

                    const err = new Error('expected error')
                    const received = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m)
                            // after first message schedule end
                            if (received.length) {
                                throw err
                            }
                        }
                    }).rejects.toThrow(err)
                    // gets some messages but not all
                    expect(received).toHaveLength(1)
                    expect(unsubscribeEvents).toHaveLength(1)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can kill stream with abort', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })
                    const sub = await M.subscribe(stream.id)
                    expect(M.count(stream.id)).toBe(1)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }

                    const received = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m)
                            // after first message schedule end
                            if (received.length === 1) {
                                await M.abort(stream.id)
                            }
                        }
                    }).rejects.toThrow('abort')
                    // gets some messages but not all
                    expect(received).toHaveLength(1)
                    expect(unsubscribeEvents).toHaveLength(1)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times, get updates then unsubscribe', async () => {
                    const sub1 = await M.subscribe(stream.id)
                    const sub2 = await M.subscribe(stream.id)

                    expect(M.count(stream.id)).toBe(2)
                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                        // eslint-disable-next-line no-await-in-loop
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

                    expect(received1).toEqual(published)
                    expect(received2).toEqual(received1)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times in parallel, get updates then unsubscribe', async () => {
                    const [sub1, sub2] = await Promise.all([
                        M.subscribe(stream.id),
                        M.subscribe(stream.id),
                    ])

                    expect(M.count(stream.id)).toBe(2)
                    const published = []
                    for (let i = 0; i < 3; i++) {
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

                    expect(received1).toEqual(published)
                    expect(received2).toEqual(received1)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream and get some updates then unsubscribe mid-stream with end', async () => {
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
                        received.push(m.getParsedContent())
                        if (received.length === 1) {
                            await sub.cancel()
                        }
                    }

                    expect(received).toEqual(published.slice(0, 1))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('finishes unsubscribe before returning', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }
                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
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

                it('finishes unsubscribe before returning from cancel', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }
                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === 2) {
                            expect(unsubscribeEvents).toHaveLength(0)
                            await sub.cancel()
                            expect(unsubscribeEvents).toHaveLength(1)
                            expect(M.count(stream.id)).toBe(0)
                        }
                    }
                    expect(received).toHaveLength(2)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can end + return and it will wait for unsubscribe', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }
                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === 2) {
                            expect(unsubscribeEvents).toHaveLength(0)
                            const tasks = [
                                sub.return(),
                                sub.cancel(),
                            ]
                            await Promise.race(tasks)
                            expect(unsubscribeEvents).toHaveLength(1)
                            await Promise.all(tasks)
                            expect(unsubscribeEvents).toHaveLength(1)
                            expect(M.count(stream.id)).toBe(0)
                        }
                    }
                    expect(received).toHaveLength(2)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can end + multiple times and it will wait for unsubscribe', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = []
                    for (let i = 0; i < 3; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                    }
                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === 2) {
                            expect(unsubscribeEvents).toHaveLength(0)
                            const tasks = [
                                sub.cancel(),
                                sub.cancel(),
                                sub.cancel(),
                            ]
                            await Promise.race(tasks)
                            expect(unsubscribeEvents).toHaveLength(1)
                            await Promise.all(tasks)
                            expect(unsubscribeEvents).toHaveLength(1)
                            expect(M.count(stream.id)).toBe(0)
                        }
                    }
                    expect(received).toHaveLength(2)
                    expect(M.count(stream.id)).toBe(0)
                })
            })

            describe('mid-stream stop methods', () => {
                let sub1
                let sub2
                let published

                beforeEach(async () => {
                    sub1 = await pTimeout(M.subscribe(stream.id), 1500, 'subscribe 1')
                    sub2 = await pTimeout(M.subscribe(stream.id), 1500, 'subscribe 2')
                })

                beforeEach(async () => {
                    published = []
                    for (let i = 0; i < 5; i++) {
                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await pTimeout((
                            client.publish(stream.id, message)
                        ), 1500, `publish msg ${i}`)
                        published.push(message)
                        // eslint-disable-next-line no-await-in-loop
                    }
                })

                it('can subscribe to stream multiple times then unsubscribe all mid-stream', async () => {
                    let sub1Received
                    let sub1ReceivedAtUnsubscribe
                    const gotOne = Defer()
                    const [received1, received2] = await Promise.all([
                        collect(sub1, async ({ received }) => {
                            sub1Received = received
                            gotOne.resolve()
                        }),
                        collect(sub2, async ({ received }) => {
                            await gotOne
                            if (received.length === 1) {
                                sub1ReceivedAtUnsubscribe = sub1Received.slice()
                                await M.unsubscribe(stream.id)
                            }
                        }),
                    ])
                    expect(received2).toEqual(published.slice(0, 1))
                    expect(received1).toEqual(published.slice(0, sub1ReceivedAtUnsubscribe.length))
                    expect(sub1ReceivedAtUnsubscribe).toEqual(sub1Received)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times then abort mid-stream', async () => {
                    let received1
                    let received2
                    let sub1ReceivedAtUnsubscribe
                    const gotOne = Defer()
                    await Promise.all([
                        expect(() => collect(sub1, ({ received }) => {
                            received1 = received
                            gotOne.resolve()
                        })).rejects.toThrow('abort'),
                        expect(() => collect(sub2, async ({ received }) => {
                            await gotOne
                            received2 = received
                            if (received.length === 1) {
                                sub1ReceivedAtUnsubscribe = received1.slice()
                                await M.abort(stream.id)
                            }
                        })).rejects.toThrow('abort'),
                    ])

                    expect(received1).toEqual(sub1ReceivedAtUnsubscribe)
                    expect(received1).toEqual(published.slice(0, sub1ReceivedAtUnsubscribe.length))
                    expect(received2).toEqual(published.slice(0, 1))

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

                    expect(received1).toEqual(published.slice(0, 4))
                    expect(received2).toEqual(published.slice(0, 1))

                    expect(M.count(stream.id)).toBe(0)
                })
            })

            it('will clean up if iterator returned before start', async () => {
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
                    received.push(m.getParsedContent())
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
                    received.push(m.getParsedContent())
                }

                // shouldn't get any messages
                expect(received).toHaveLength(0)
                expect(unsubscribeEvents).toHaveLength(1)
                expect(M.count(stream.id)).toBe(0)
            })
        })
    }
})
