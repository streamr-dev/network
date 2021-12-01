// import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { getPublishTestMessages, createTestStream, getCreateClient, describeRepeats, collect } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'

import { Stream } from '../../src/Stream'
import Subscription from '../../src/Subscription'
import Subscriber from '../../src/Subscriber'
import { Todo } from '../../src/types'

// const { ControlMessage } = ControlLayer

const MAX_ITEMS = 3
const NUM_MESSAGES = 8
jest.setTimeout(60000)

describeRepeats('Subscriber', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client: StreamrClient
    let stream: Stream
    let M: Subscriber
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>

    const createClient = getCreateClient()

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
    })

    beforeEach(async () => {
        // eslint-disable-next-line require-atomic-updates
        client = await createClient()
        M = client.subscriber
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
        ])
        stream = await createTestStream(client, module)
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

    describe('basics', () => {
        it('works when passing stream', async () => {
            const sub = await M.subscribe(stream)
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages(NUM_MESSAGES)

            const received = await sub.collectContent(published.length)
            expect(received).toEqual(published)
            expect(received).toHaveLength(NUM_MESSAGES)
        })

        it('works when passing { stream: stream }', async () => {
            const sub = await M.subscribe({
                stream,
            })
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = await sub.collectContent(published.length)
            expect(received).toEqual(published)
        })

        it('works when passing streamId as string', async () => {
            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = await sub.collectContent(published.length)
            expect(received).toEqual(published)
            expect(M.count(stream.id)).toBe(0)
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

            it('keeps other subscriptions running if one subscription errors', async () => {
                const err = new Error('expected')
                const sub1 = await M.subscribe(stream.id)
                const sub2 = await M.subscribe(stream.id)

                let count = 0
                sub1.pipe(async function* ThrowError(s) {
                    for await (const msg of s) {
                        if (count === MAX_ITEMS) {
                            sub1.debug('throwing...')
                            throw err
                        }
                        count += 1
                        yield msg
                    }
                })

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                await expect(async () => {
                    await sub1.collectContent(NUM_MESSAGES)
                }).rejects.toThrow()
                const received = await sub2.collectContent(NUM_MESSAGES)
                expect(received).toEqual(published)
                expect(count).toEqual(MAX_ITEMS)
            })

            it('errors subscription iterator do not trigger onError', async () => {
                const err = new Error('expected')
                const sub1 = await M.subscribe(stream.id)

                const onError1 = jest.fn()
                sub1.onError(onError1)

                let count = 0
                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })
                const received1: any[] = []
                await expect(async () => {
                    for await (const msg of sub1) {
                        if (count === MAX_ITEMS) {
                            sub1.debug('throwing...')
                            throw err
                        }
                        count += 1
                        received1.push(msg.getParsedContent())
                    }
                }).rejects.toThrow(err)

                expect(received1).toEqual(published.slice(0, MAX_ITEMS))
                expect(onError1).toHaveBeenCalledTimes(0)
            })

            it('errors subscription onMessage callback do trigger onError', async () => {
                const err = new Error('expected')
                let count = 0
                const received1: any[] = []
                const sub1 = await M.subscribe(stream.id, (content) => {
                    if (count === MAX_ITEMS) {
                        sub1.debug('throwing...')
                        throw err
                    }
                    count += 1
                    received1.push(content)
                })

                const onError1 = jest.fn()
                sub1.onError(onError1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                expect(received1).toEqual(published.slice(0, MAX_ITEMS))
                expect(onError1).toHaveBeenCalledTimes(1)
            })

            it('errors in onMessage callback are not handled by other subscriptions', async () => {
                const err = new Error('expected')
                let count = 0
                const received1: any[] = []
                const sub1 = await M.subscribe(stream.id, (content) => {
                    if (count === MAX_ITEMS) {
                        sub1.debug('throwing...')
                        throw err
                    }
                    count += 1
                    received1.push(content)
                })

                const sub2 = await M.subscribe(stream.id)

                const onError1 = jest.fn()
                sub1.onError(onError1)
                const onError2 = jest.fn()
                sub2.onError(onError2)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received = await sub2.collectContent(NUM_MESSAGES)
                expect(received).toEqual(published)
                expect(onError1).toHaveBeenCalledTimes(1)
                expect(onError1).toHaveBeenCalledWith(err)
                expect(onError2).toHaveBeenCalledTimes(0)
                expect(count).toEqual(MAX_ITEMS)
                expect(M.count(stream.id)).toBe(0)
            })

            it('keeps other subscriptions running if pipeline has error but subscription onError ignores it', async () => {
                const THROW_AFTER = MAX_ITEMS
                const err = new Error('expected')
                const sub1 = await M.subscribe(stream.id)
                const sub2 = await M.subscribe(stream.id)

                expect(sub1.context).toBe(sub2.context)
                sub1.context.pipeline.forEachBefore((s, count) => {
                    if (count === THROW_AFTER) {
                        sub1.debug('throwing...', count, s)
                        throw err
                    }
                })

                const onMessage = jest.fn()
                sub1.onMessage(onMessage)
                sub1.onMessage((msg) => {
                    received1.push(msg.getParsedContent())
                })

                const onSuppressError = jest.fn()
                sub2.onError(onSuppressError)

                const received1: any[] = []
                const publishTask = publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })
                publishTask.catch(() => {})

                try {
                    await expect(async () => {
                        const received3 = await sub1.collectContent(NUM_MESSAGES)
                        sub1.debug({ received3 })
                    }).rejects.toThrow()
                    const published = await publishTask
                    const received2 = await sub2.collectContent(NUM_MESSAGES - 1)

                    sub1.debug({ received1, received2 })
                    expect(onSuppressError).toHaveBeenCalledTimes(1)
                    expect(received1).toEqual(published.slice(0, THROW_AFTER))
                    expect(received2).toEqual(published.filter((_msg, index) => index !== THROW_AFTER))
                    // should get all messages but see a gap at message MAX_ITEMS
                } finally {
                    await publishTask
                }
            })

            it('multiple publishers: keeps other subscriptions running if pipeline has error but subscription onError ignores it', async () => {
                const THROW_AFTER = MAX_ITEMS
                const sub1 = await M.subscribe(stream.id)
                const sub2 = await M.subscribe(stream.id)

                expect(sub1.context).toBe(sub2.context)
                let msgChainId: string
                let count1 = 0
                let count2 = 0
                sub1.context.pipeline.forEachBefore((s) => {
                    const msgChain = s.getMsgChainId()
                    if (msgChainId === undefined) {
                        msgChainId = msgChain
                    }
                    try {
                        if (count1 === THROW_AFTER || count2 === THROW_AFTER) {
                            sub1.debug('throwing...', count1, count2, s)
                            throw new Error('expected')
                        }
                    } finally {
                        // count based on msgChain
                        if (msgChainId === msgChain) {
                            count1 += 1
                        } else {
                            count2 += 1
                        }
                    }
                })

                const onMessage = jest.fn()
                sub1.onMessage(onMessage)
                sub1.onMessage((msg) => {
                    sub1.debug('msg', msg)
                    received1.push(msg.getParsedContent())
                })

                const onSuppressError = jest.fn()
                sub2.onError(onSuppressError)

                const received1: any[] = []
                const client2 = await createClient({
                    auth: client.options.auth,
                })

                const publishTestMessages2 = getPublishTestMessages(client2, stream)
                const publishTask = publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })
                publishTask.catch(() => {})
                const publishTask2 = publishTestMessages2(NUM_MESSAGES, {
                    timestamp: 222222,
                })
                publishTask2.catch(() => {})

                try {
                    await expect(async () => {
                        await sub1.collectContent(NUM_MESSAGES)
                    }).rejects.toThrow()
                    const published1: any[] = await publishTask
                    const published2: any[] = await publishTask2
                    const received2 = await sub2.collectContent((NUM_MESSAGES * 2) - 2)

                    expect(onSuppressError).toHaveBeenCalledTimes(2)
                    // filter two msg chains
                    const r1 = received2.filter(({ batchId }) => batchId === published1[0].batchId)
                    const r2 = received2.filter(({ batchId }) => batchId === published2[0].batchId)
                    // should get all messages but see a gap at message THROW_AFTER
                    expect(r1).toEqual(published1.filter((opt: any) => opt.index !== THROW_AFTER))
                    expect(r2).toEqual(published2.filter((opt: any) => opt.index !== THROW_AFTER))
                } finally {
                    await publishTask
                    await publishTask2
                }
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

            })
            */

            it('will skip bad message if error handler attached', async () => {
                const err = new Error('expected')

                const sub = await M.subscribe({
                    ...stream,
                })
                sub.forEach((_item, index) => {
                    if (index === MAX_ITEMS) {
                        sub.debug('THROWING ERR')
                        throw err
                    }
                })

                const onSubscriptionError = jest.fn((error: Error) => {
                    sub.debug('onSubscriptionError', error)
                })
                sub.onError(onSubscriptionError)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

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
                const err = new Error('expected')

                const sub = await M.subscribe({
                    ...stream,
                })

                sub.forEach((_item, index) => {
                    if (index === MAX_ITEMS) {
                        throw err
                    }
                })

                const received: any[] = []
                const onSubscriptionError = jest.fn((error: Error) => {
                    throw error
                })

                sub.onError(onSubscriptionError)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                await expect(async () => {
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === published.length) {
                            break
                        }
                    }
                }).rejects.toThrow()
                expect(received).toEqual(published.slice(0, MAX_ITEMS))
                expect(onSubscriptionError).toHaveBeenCalledTimes(1)
            })
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

        it('can unsubscribe then subscribe in parallel', async () => {
            const [_, sub] = await Promise.all([
                M.unsubscribe(stream.id),
                M.subscribe(stream.id),
            ])

            expect(M.count(stream.id)).toBe(1)

            const published = await publishTestMessages(3)

            const received = await sub.collectContent(3)

            expect(received).toEqual(published)
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
