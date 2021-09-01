// import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { getPublishTestMessages, createTestStream, fakePrivateKey, describeRepeats, collect } from '../utils'
import { BrubeckClient } from '../../src/BrubeckClient'
import { Defer } from '../../src/utils'
// import Connection from '../../src/Connection'
// import { StorageNode } from '../../src/stream/StorageNode'

import clientOptions from './config'
import { Stream } from '../../src/Stream'
import Subscription from '../../src/Subscription'
import Subscriber from '../../src/Subscriber'
import { Todo } from '../../src/types'

// const { ControlMessage } = ControlLayer

const MAX_ITEMS = 2
const NUM_MESSAGES = 6

describeRepeats('Subscriber', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client: BrubeckClient
    let stream: Stream
    let M: Subscriber
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>

    const createClient = (opts: any = {}) => {
        const c = new BrubeckClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
        return c
    }

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
    })

    beforeEach(async () => {
        // eslint-disable-next-line require-atomic-updates
        client = createClient()
        M = client.subscriber
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
            client.getSessionToken(),
        ])
        stream = await createTestStream(client, module)
        await client.connect()
        client.debug('connecting before test <<')
        publishTestMessages = getPublishTestMessages(client, stream)
    })

    afterEach(() => {
        client.debug('after test')
        expect(M.count()).toBe(0)
        expect(M.count(stream.id)).toBe(0)
        expect(M.countSubscriptionSessions()).toBe(0)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
    })

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test >>')
            await client.destroy()
            client.debug('disconnecting after test <<')
        }
    })

    describe('basics', () => {
        it('works when passing stream', async () => {
            const sub = await M.subscribe(stream)
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages(NUM_MESSAGES)

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
            expect(received).toHaveLength(NUM_MESSAGES)
        })

        it('works when passing { stream: stream }', async () => {
            const sub = await M.subscribe({
                stream,
            })
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
        })

        it('can subscribe to stream and get updates then auto unsubscribe', async () => {
            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
        })

        it('subscribes immediately', async () => {
            const sub = await M.subscribe(stream.id)

            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }

            expect(received).toEqual(published)
        })

        // it('errors if not connected', async () => {
        // await client.disconnect()
        // await expect(() => (
        // M.subscribe(stream)
        // )).rejects.toThrow('connect')
        // expect(M.count(stream.id)).toBe(0)
        // })

        it('errors if iterating twice', async () => {
            const sub = await M.subscribe(stream)
            const c1 = sub.collect()

            await expect(async () => (
                sub.collect()
            )).rejects.toThrow()
            await sub.unsubscribe()
            const m = await c1

            expect(m).toEqual([])

            expect(M.count(stream.id)).toBe(0)
        })

        describe('subscription error handling', () => {
            it('works when error thrown inline', async () => {
                const err = new Error('expected')
                const sub = (await M.subscribe({
                    ...stream,
                })).pipe(async function* ThrowError(s) {
                    let count = 0
                    for await (const msg of s) {
                        if (count === MAX_ITEMS) {
                            throw err
                        }
                        count += 1
                        yield msg
                    }
                })

                expect(M.count(stream.id)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received: Todo[] = []
                await expect(async () => {
                    for await (const msg of sub) {
                        received.push(msg.getParsedContent())
                    }
                }).rejects.toThrow(err)
                expect(received).toEqual(published.slice(0, MAX_ITEMS))
                await wait(100)
            })

            it('works when multiple steps error', async () => {
                const err = new Error('expected')

                const sub = await M.subscribe({
                    ...stream,
                })

                const v = sub
                    .pipe(async function* ThrowError1(s) {
                        let count = 0
                        for await (const msg of s) {
                            if (count === MAX_ITEMS) {
                                throw err
                            }
                            count += 1
                            yield msg
                        }
                    })
                    .pipe(async function* ThrowError2(s) {
                        let count = 0
                        for await (const msg of s) {
                            if (count === MAX_ITEMS) {
                                throw err
                            }
                            count += 1
                            yield msg
                        }
                    })

                expect(M.count(stream.id)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received: any[] = []
                await expect(async () => {
                    for await (const m of v) {
                        received.push(m.getParsedContent())
                    }
                }).rejects.toThrow(err)
                expect(received).toEqual(published.slice(0, MAX_ITEMS))
            })

            /*
            describe.skip('error is bad groupkey', () => {
                let sub: Subscription
                const BAD_GROUP_KEY_ID = 'BAD_GROUP_KEY_ID'

                beforeEach(async () => {
                    await client.publisher.startKeyExchange()
                    sub = await M.subscribe({
                        ...stream,
                        // @ts-expect-error not in type but works
                        beforeSteps: [
                            async function* ThrowError(s: AsyncIterable<Todo>) {
                                let count = 0
                                for await (const msg of s) {
                                    if (count === MAX_ITEMS) {
                                        msg.streamMessage.encryptionType = 2
                                        msg.streamMessage.groupKeyId = BAD_GROUP_KEY_ID
                                    }
                                    count += 1
                                    yield msg
                                }
                            }
                        ]
                    })

                    expect(M.count(stream.id)).toBe(1)
                })

                it('throws subscription loop when encountering bad message', async () => {
                    const published = await publishTestMessages(NUM_MESSAGES, {
                        timestamp: 111111,
                    })

                    const received: Todo[] = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m.getParsedContent())
                        }
                    }).rejects.toThrow(BAD_GROUP_KEY_ID)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                })

                it('will skip bad message if error handler attached', async () => {
                    const published = await publishTestMessages(NUM_MESSAGES, {
                        timestamp: 111111,
                    })

                    const onSubscriptionError = jest.fn()
                    sub.on('error', onSubscriptionError)

                    const received = []
                    let t!: ReturnType<typeof setTimeout>
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === published.length - 1) {
                            // eslint-disable-next-line no-loop-func
                            t = setTimeout(() => {
                                // give it a moment to incorrectly get messages
                                sub.unsubscribe()
                            }, 100)
                        }

                        if (received.length === published.length) {
                            break
                        }
                    }
                    clearTimeout(t)
                    expect(received).toEqual([
                        ...published.slice(0, MAX_ITEMS),
                        ...published.slice(MAX_ITEMS + 1)
                    ])
                    expect(onSubscriptionError).toHaveBeenCalledTimes(1)
                })

                it('will not skip bad message if error handler attached & throws', async () => {
                    expect(M.count(stream.id)).toBe(1)

                    const published = await publishTestMessages(NUM_MESSAGES, {
                        timestamp: 111111,
                    })

                    const received: any[] = []
                    const onSubscriptionError = jest.fn((err) => {
                        throw err
                    })

                    sub.on('error', onSubscriptionError)
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m.getParsedContent())
                            if (received.length === published.length) {
                                break
                            }
                        }
                    }).rejects.toThrow(BAD_GROUP_KEY_ID)
                    expect(received).toEqual(published.slice(0, MAX_ITEMS))
                    expect(onSubscriptionError).toHaveBeenCalledTimes(1)
                })
            })
            */
        })
    })

    describe('ending a subscription', () => {
        it('can kill stream using async unsubscribe', async () => {
            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            await publishTestMessages()
            let unsubscribeTask!: Promise<any>
            let t!: ReturnType<typeof setTimeout>
            let expectedLength = -1
            const received = []
            try {
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    // after first message schedule end
                    if (received.length === 1) {
                        // eslint-disable-next-line no-loop-func
                        t = setTimeout(() => {
                            expectedLength = received.length
                            // should not see any more messages after end
                            unsubscribeTask = sub.unsubscribe()
                        })
                    }
                }

                expect(unsubscribeTask).toBeTruthy()
                // gets some messages but not all
                expect(received).toHaveLength(expectedLength)
            } finally {
                clearTimeout(t)
                await unsubscribeTask
            }
        })

        it('can kill stream with throw', async () => {
            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            await publishTestMessages()

            const err = new Error('expected error')
            const received: Todo[] = []
            await expect(async () => {
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    // after first message schedule end
                    if (received.length === 1) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            // gets some messages but not all
            expect(received).toHaveLength(1)
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
        })

        it('can subscribe to stream and get some updates then unsubscribe mid-stream with end', async () => {
            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === 1) {
                    await sub.unsubscribe()
                }
            }

            expect(received).toEqual(published.slice(0, 1))
            expect(M.count(stream.id)).toBe(0)
        })

        it('finishes unsubscribe before returning', async () => {
            const sub = await M.subscribe(stream.id)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_ITEMS) {
                    await sub.return()
                    expect(M.count(stream.id)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received).toEqual(published.slice(0, MAX_ITEMS))
        })

        it('finishes unsubscribe before returning from cancel', async () => {
            const sub = await M.subscribe(stream.id)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_ITEMS) {
                    await sub.unsubscribe()
                    expect(M.count(stream.id)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received).toEqual(published.slice(0, MAX_ITEMS))
        })

        it('can unsubscribe + return and it will wait for unsubscribe', async () => {
            const sub = await M.subscribe(stream.id)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_ITEMS) {
                    await Promise.all([
                        sub.return(),
                        sub.unsubscribe(),
                    ])
                    expect(M.count(stream.id)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received).toEqual(published.slice(0, MAX_ITEMS))
        })

        it('can cancel multiple times and it will wait for unsubscribe', async () => {
            const sub = await M.subscribe(stream.id)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_ITEMS) {
                    const tasks = [
                        sub.unsubscribe(),
                        sub.unsubscribe(),
                        sub.unsubscribe(),
                    ]
                    await Promise.all(tasks)
                    expect(M.count(stream.id)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received).toEqual(published.slice(0, MAX_ITEMS))
        })

        it('will clean up if iterator returned before start', async () => {
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

            expect(M.count(stream.id)).toBe(0)
        })

        it('can subscribe then unsubscribe in parallel', async () => {
            const [sub] = await Promise.all([
                M.subscribe(stream.id),
                M.unsubscribe(stream.id),
            ])

            expect(M.count(stream.id)).toBe(0)

            await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
            }

            // shouldn't get any messages
            expect(received).toHaveLength(0)
            expect(M.count(stream.id)).toBe(0)
        })
    })

    describe('mid-stream stop methods', () => {
        let sub1: Subscription<Todo>
        let sub2: Subscription<Todo>
        let published: Todo[]

        beforeEach(async () => {
            sub1 = await M.subscribe(stream.id)
            sub2 = await M.subscribe(stream.id)
            published = await publishTestMessages(5, { delay: 50 })
        })

        it('can subscribe to stream multiple times then unsubscribe all mid-stream', async () => {
            let sub1Received: Todo[] = []
            let sub1ReceivedAtUnsubscribe: Todo[] = []
            const gotOne = Defer()
            let didGetOne = false
            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received }) => {
                    sub1Received = received
                    didGetOne = true
                    gotOne.resolve(undefined)
                }),
                collect(sub2, async ({ received }) => {
                    if (!didGetOne) { // don't delay unsubscribe
                        await gotOne
                    }

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

        it('can subscribe to stream multiple times then unsubscribe one mid-stream', async () => {
            let sub2ReceivedAtUnsubscribe
            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return()
                    }
                }),
                collect(sub2, async ({ received }) => {
                    if (received.length === MAX_ITEMS) {
                        sub2ReceivedAtUnsubscribe = received.slice()
                        await sub2.unsubscribe()
                    }
                }),
            ])
            expect(received2).toEqual(published.slice(0, MAX_ITEMS))
            expect(received1).toEqual(published)
            expect(sub2ReceivedAtUnsubscribe).toEqual(received2)
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
})
