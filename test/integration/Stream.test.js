import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'
import { Defer, pTimeout } from '../../src/utils'
import Connection from '../../src/Connection'
import MessageStream from '../../src/subscribe'

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
const MAX_ITEMS = 2

describe('StreamrClient Stream', () => {
    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(`test repeat ${k + 1} of ${TEST_REPEATS}`, () => {
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

            async function publishTestMessages(n = 4, streamId = stream.id) {
                const published = []
                for (let i = 0; i < n; i++) {
                    const message = Msg()
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await pTimeout(client.publish(streamId, message), 1500, `publish timeout ${streamId}: ${i} ${JSON.stringify(message)}`)
                    published.push(message)
                }
                return published
            }

            it('attaches listener at subscribe time', async () => {
                const beforeCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
                const sub = await M.subscribe(stream.id)
                const afterCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
                expect(afterCount).toBeGreaterThan(beforeCount)
                expect(M.count(stream.id)).toBe(1)
                await sub.return()
                expect(M.count(stream.id)).toBe(0)
            })

            describe('basics', () => {
                it('can subscribe to stream and get updates then auto unsubscribe', async () => {
                    const sub = await M.subscribe(stream.id)
                    expect(M.count(stream.id)).toBe(1)

                    const published = await publishTestMessages()

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

                    const published = await publishTestMessages()

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

                    await publishTestMessages()
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

                    await publishTestMessages()

                    const err = new Error('expected error')
                    const received = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m)
                            // after first message schedule end
                            if (received.length === 1) {
                                throw err
                            }
                        }
                    }).rejects.toThrow(err)
                    // gets some messages but not all
                    expect(received).toHaveLength(1)
                    expect(unsubscribeEvents).toHaveLength(1)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times, get updates then unsubscribe', async () => {
                    const sub1 = await M.subscribe(stream.id)
                    const sub2 = await M.subscribe(stream.id)

                    expect(M.count(stream.id)).toBe(2)

                    const published = await publishTestMessages()

                    const [received1, received2] = await Promise.all([
                        collect(sub1, async ({ received, iterator }) => {
                            if (received.length === published.length) {
                                await iterator.return()
                            }
                        }),
                        collect(sub2, async ({ received, iterator }) => {
                            if (received.length === published.length) {
                                await iterator.return()
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
                    const published = await publishTestMessages()

                    const [received1, received2] = await Promise.all([
                        collect(sub1, async ({ received, iterator }) => {
                            if (received.length === published.length) {
                                await iterator.return()
                            }
                        }),
                        collect(sub2, async ({ received, iterator }) => {
                            if (received.length === published.length) {
                                await iterator.return()
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

                    const published = await publishTestMessages()

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

                    const published = await publishTestMessages()

                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === MAX_ITEMS) {
                            expect(unsubscribeEvents).toHaveLength(0)
                            await sub.return()
                            expect(unsubscribeEvents).toHaveLength(1)
                            expect(M.count(stream.id)).toBe(0)
                        }
                    }
                    expect(received).toHaveLength(MAX_ITEMS)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('finishes unsubscribe before returning from cancel', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = await publishTestMessages()

                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === MAX_ITEMS) {
                            expect(unsubscribeEvents).toHaveLength(0)
                            await sub.cancel()
                            expect(unsubscribeEvents).toHaveLength(1)
                            expect(M.count(stream.id)).toBe(0)
                        }
                    }
                    expect(received).toHaveLength(MAX_ITEMS)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can cancel + return and it will wait for unsubscribe', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = await publishTestMessages()

                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === MAX_ITEMS) {
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
                    expect(received).toHaveLength(MAX_ITEMS)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can cancel multiple times and it will wait for unsubscribe', async () => {
                    const unsubscribeEvents = []
                    client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                        unsubscribeEvents.push(m)
                    })

                    const sub = await M.subscribe(stream.id)

                    const published = await publishTestMessages()

                    const received = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === MAX_ITEMS) {
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
                    expect(received).toHaveLength(MAX_ITEMS)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                    expect(M.count(stream.id)).toBe(0)
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

                    await publishTestMessages()

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

                    await publishTestMessages()

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

            describe('mid-stream stop methods', () => {
                let sub1
                let sub2
                let published

                beforeEach(async () => {
                    sub1 = await M.subscribe(stream.id)
                    sub2 = await M.subscribe(stream.id)
                    published = await publishTestMessages(5)
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
                            if (received.length === MAX_ITEMS) {
                                sub1ReceivedAtUnsubscribe = sub1Received.slice()
                                await M.unsubscribe(stream.id)
                            }
                        }),
                    ])
                    expect(received2).toEqual(published.slice(0, MAX_ITEMS))
                    expect(received1).toEqual(published.slice(0, sub1ReceivedAtUnsubscribe.length))
                    expect(sub1ReceivedAtUnsubscribe).toEqual(sub1Received)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('can subscribe to stream multiple times then return mid-stream', async () => {
                    const [received1, received2] = await Promise.all([
                        collect(sub1, async ({ received, iterator }) => {
                            if (received.length === MAX_ITEMS - 1) {
                                await iterator.return()
                            }
                        }),
                        collect(sub2, async ({ received, iterator }) => {
                            if (received.length === MAX_ITEMS) {
                                await iterator.return()
                            }
                        }),
                    ])

                    expect(received1).toEqual(published.slice(0, MAX_ITEMS - 1))
                    expect(received2).toEqual(published.slice(0, MAX_ITEMS))
                    expect(M.count(stream.id)).toBe(0)
                })
            })

            describe('connection states', () => {
                let sub

                beforeEach(async () => {
                    if (sub) {
                        await sub.cancel()
                    }
                })

                it('should reconnect subscriptions when connection disconnected before subscribed & reconnected', async () => {
                    await client.connect()
                    const subTask = M.subscribe(stream.id)
                    await true
                    client.connection.socket.close()
                    const published = await publishTestMessages(2)
                    sub = await subTask
                    const received = []
                    for await (const msg of sub) {
                        received.push(msg.getParsedContent())
                        if (received.length === published.length) {
                            expect(received).toEqual(published)
                        }
                        break
                    }
                })

                it('should re-subscribe when subscribed then reconnected', async () => {
                    await client.connect()
                    const sub = await M.subscribe(stream.id)
                    let published = await publishTestMessages(2)
                    let received = []
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
                })

                it('should end when subscribed then disconnected', async () => {
                    await client.connect()
                    const sub = await M.subscribe(stream.id)
                    let published = await publishTestMessages(2)
                    let received = []
                    for await (const msg of sub) {
                        received.push(msg.getParsedContent())
                        if (received.length === 1) {
                            expect(received).toEqual(published.slice(0, 1))
                            client.disconnect() // should trigger break
                            // no await, should be immediate
                        }
                    }
                    expect(received).toEqual(published.slice(0, 1))
                })

                it('should end when subscribed then disconnected', async () => {
                    await client.connect()
                    const sub = await M.subscribe(stream.id)
                    let published = await publishTestMessages(2)
                    let received = []
                    await client.disconnect()
                    for await (const msg of sub) {
                        received.push(msg.getParsedContent())
                    }
                    client.connect() // no await, should be ok
                    const sub2 = await M.subscribe(stream.id)
                    let published2 = await publishTestMessages(2)
                    let received2 = []
                    for await (const msg of sub2) {
                        received2.push(msg.getParsedContent())
                        if (received2.length === 1) {
                            await client.disconnect()
                        }
                    }
                    expect(received2).toEqual(published2.slice(0, 1))
                })
            })
        })
    }
})
