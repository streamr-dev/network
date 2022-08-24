import { StreamMessage } from 'streamr-client-protocol'
import { fastWallet, waitForCondition } from 'streamr-test-utils'
import { createTestStream } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils/Defer'
import { Subscription } from '../../src/subscribe/Subscription'
import { MaybeAsync, StreamDefinition, StreamPermission } from '../../src'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { getPublishTestStreamMessages } from '../test-utils/publish'

const MAX_ITEMS = 3
const NUM_MESSAGES = 8

const collect = async <T>(
    iterator: AsyncGenerator<StreamMessage<T>>,
    fn: MaybeAsync<(item: {
        msg: StreamMessage<T>
        iterator: AsyncGenerator<StreamMessage<T>>
        received: StreamMessage<T>[]
    }) => void> = async () => {}
): Promise<StreamMessage[]> => {
    const received: StreamMessage<T>[] = []
    for await (const msg of iterator) {
        received.push(msg)
        await fn({
            msg, iterator, received,
        })
    }
    return received
}

describe('Subscriber', () => {
    let client: StreamrClient
    let streamDefinition: StreamDefinition
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>

    const getSubscriptionCount = (def?: StreamDefinition) => {
        // @ts-expect-error private
        return client.subscriber.count(def)
    }
    
    beforeEach(async () => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        const stream = await createTestStream(client, module)
        streamDefinition = stream.getStreamParts()[0]
        const publisherWallet = fastWallet()
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        publishTestMessages = getPublishTestStreamMessages(environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        }), streamDefinition)
    })

    afterEach(async () => {
        expect(await getSubscriptionCount()).toBe(0)
        expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        // @ts-expect-error private
        expect(client.subscriber.countSubscriptionSessions()).toBe(0)
    })

    describe('basics', () => {
        it('works when passing stream', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages(NUM_MESSAGES)

            const received = await sub.collect(published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received).toHaveLength(NUM_MESSAGES)
        })

        it('works when passing { stream: stream }', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages()

            const received = await sub.collect(published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })

        it('works when passing streamId as string', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages()

            const received = await sub.collect(published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('errors if iterating twice', async () => {
            const sub = await client.subscribe(streamDefinition)
            const c1 = sub.collect()

            await expect(async () => (
                sub.collect()
            )).rejects.toThrow()
            await sub.unsubscribe()
            const m = await c1

            expect(m).toEqual([])

            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        describe('subscription error handling', () => {
            it('works when error thrown inline', async () => {
                const err = new Error('expected')
                const sub = (await client.subscribe(streamDefinition)).pipe(async function* ThrowError(s) {
                    let count = 0
                    for await (const msg of s) {
                        if (count === MAX_ITEMS) {
                            throw err
                        }
                        count += 1
                        yield msg
                    }
                })

                expect(await getSubscriptionCount(streamDefinition)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const onErrorHandler = jest.fn()
                sub.onError.listen(onErrorHandler)

                const received: StreamMessage[] = []
                for await (const msg of sub) {
                    received.push(msg)
                }
                expect(onErrorHandler).toHaveBeenCalledWith(err)
                expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            })

            it('works when multiple steps error', async () => {
                const err = new Error('expected')

                const sub = await client.subscribe(streamDefinition)

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

                expect(await getSubscriptionCount(streamDefinition)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const onErrorHandler = jest.fn()
                sub.onError.listen(onErrorHandler)

                const received: StreamMessage[] = []
                for await (const m of v) {
                    received.push(m)
                }
                expect(onErrorHandler).toHaveBeenCalledWith(err)
                expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            })

            it('keeps other subscriptions running if one subscription errors', async () => {
                const err = new Error('expected')
                const sub1 = await client.subscribe(streamDefinition)
                const sub2 = await client.subscribe(streamDefinition)

                let count = 0
                sub1.pipe(async function* ThrowError(s) {
                    for await (const msg of s) {
                        if (count === MAX_ITEMS) {
                            throw err
                        }
                        count += 1
                        yield msg
                    }
                })

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const onErrorHandler = jest.fn()
                sub1.onError.listen(onErrorHandler)

                await sub1.collect(NUM_MESSAGES)
                const received = await sub2.collect(NUM_MESSAGES)
                expect(onErrorHandler).toHaveBeenCalledWith(err)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(count).toEqual(MAX_ITEMS)
            })

            it('errors subscription iterator do not trigger onError', async () => {
                const err = new Error('expected')
                const sub1 = await client.subscribe(streamDefinition)

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)

                let count = 0
                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })
                const received1: StreamMessage[] = []
                await expect(async () => {
                    for await (const msg of sub1) {
                        if (count === MAX_ITEMS) {
                            throw err
                        }
                        count += 1
                        received1.push(msg)
                    }
                }).rejects.toThrow(err)

                expect(received1.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
                expect(onError1).toHaveBeenCalledTimes(0)
            })

            it('errors subscription onMessage callback do trigger onError', async () => {
                const err = new Error('expected')
                let count = 0
                const received1: StreamMessage[] = []
                const sub1 = await client.subscribe(streamDefinition, (_content, msg) => {
                    if (count === MAX_ITEMS) {
                        throw err
                    }
                    count += 1
                    received1.push(msg)
                })

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })
                await waitForCondition(() => onError1.mock.calls.length > 0)
                
                expect(received1.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
                expect(onError1).toHaveBeenCalledTimes(1)
            })

            it('errors in onMessage callback are not handled by other subscriptions', async () => {
                const err = new Error('expected')
                let count = 0
                const received1: any[] = []
                const sub1 = await client.subscribe(streamDefinition, (content) => {
                    if (count === MAX_ITEMS) {
                        throw err
                    }
                    count += 1
                    received1.push(content)
                })

                const sub2 = await client.subscribe(streamDefinition)

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)
                const onError2 = jest.fn()
                sub2.onError.listen(onError2)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received = await sub2.collect(NUM_MESSAGES)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(onError1).toHaveBeenCalledTimes(1)
                expect(onError1).toHaveBeenCalledWith(err)
                expect(onError2).toHaveBeenCalledTimes(0)
                expect(count).toEqual(MAX_ITEMS)
                expect(await getSubscriptionCount(streamDefinition)).toBe(0)
            })

            it('will skip bad message if error handler attached', async () => {
                const err = new Error('expected')

                const sub = await client.subscribe(streamDefinition)
                sub.forEach((_item, index) => {
                    if (index === MAX_ITEMS) {
                        throw err
                    }
                })

                const onSubscriptionError = jest.fn()
                sub.onError.listen(onSubscriptionError)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received: StreamMessage[] = []
                let t!: ReturnType<typeof setTimeout>
                for await (const m of sub) {
                    received.push(m)
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
                expect(received.map((m) => m.signature)).toEqual([
                    ...published.slice(0, MAX_ITEMS),
                    ...published.slice(MAX_ITEMS + 1)
                ].map((m) => m.signature))
                expect(onSubscriptionError).toHaveBeenCalledTimes(1)
            })

            it('will not skip bad message if error handler attached & throws', async () => {
                const err = new Error('expected')

                const sub = await client.subscribe(streamDefinition)

                sub.forEach((_item, index) => {
                    if (index === MAX_ITEMS) {
                        throw err
                    }
                })

                const received: StreamMessage[] = []
                const onSubscriptionError = jest.fn((error: Error) => {
                    throw error
                })

                sub.onError.listen(onSubscriptionError)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                await expect(async () => {
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === published.length) {
                            break
                        }
                    }
                }).rejects.toThrow()
                expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
                expect(onSubscriptionError).toHaveBeenCalledTimes(1)
            })
        })
    })

    describe('ending a subscription', () => {
        it('can kill stream using async unsubscribe', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            await publishTestMessages()
            let unsubscribeTask!: Promise<any>
            let t!: ReturnType<typeof setTimeout>
            let expectedLength = -1
            const received: StreamMessage[] = []
            try {
                for await (const m of sub) {
                    received.push(m)
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
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            await publishTestMessages()

            const err = new Error('expected error')
            const received: StreamMessage[] = []
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
        })

        it('can subscribe to stream multiple times, get updates then unsubscribe', async () => {
            const sub1 = await client.subscribe(streamDefinition)
            const sub2 = await client.subscribe(streamDefinition)

            expect(await getSubscriptionCount(streamDefinition)).toBe(2)

            const published = await publishTestMessages()

            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return(undefined)
                    }
                }),
                collect(sub2, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return(undefined)
                    }
                })
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(received1.map((m) => m.signature))
        })

        it('can subscribe to stream multiple times in parallel, get updates then unsubscribe', async () => {
            const [sub1, sub2] = await Promise.all([
                client.subscribe(streamDefinition),
                client.subscribe(streamDefinition),
            ])

            expect(await getSubscriptionCount(streamDefinition)).toBe(2)
            const published = await publishTestMessages()

            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return(undefined)
                    }
                }),
                collect(sub2, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return(undefined)
                    }
                })
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(received1.map((m) => m.signature))
        })

        it('can subscribe to stream and get some updates then unsubscribe mid-stream with end', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === 1) {
                    await sub.unsubscribe()
                }
            }

            expect(received.map((m) => m.signature)).toEqual(published.slice(0, 1).map((m) => m.signature))
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('finishes unsubscribe before returning', async () => {
            const sub = await client.subscribe(streamDefinition)

            const published = await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await sub.return()
                    expect(await getSubscriptionCount(streamDefinition)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('finishes unsubscribe before returning from cancel', async () => {
            const sub = await client.subscribe(streamDefinition)

            const published = await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await sub.unsubscribe()
                    expect(await getSubscriptionCount(streamDefinition)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('can unsubscribe + return and it will wait for unsubscribe', async () => {
            const sub = await client.subscribe(streamDefinition)

            const published = await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await Promise.all([
                        sub.return(),
                        sub.unsubscribe(),
                    ])
                    expect(await getSubscriptionCount(streamDefinition)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('can cancel multiple times and it will wait for unsubscribe', async () => {
            const sub = await client.subscribe(streamDefinition)

            const published = await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    const tasks = [
                        sub.unsubscribe(),
                        sub.unsubscribe(),
                        sub.unsubscribe(),
                    ]
                    await Promise.all(tasks)
                    expect(await getSubscriptionCount(streamDefinition)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('will clean up if iterator returned before start', async () => {
            const sub = await client.subscribe(streamDefinition)
            expect(await getSubscriptionCount(streamDefinition)).toBe(1)
            await sub.return()
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)

            await publishTestMessages()

            const received: StreamMessage[] = []
            for await (const m of sub) {
                received.push(m)
            }
            expect(received).toHaveLength(0)

            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('can subscribe then unsubscribe in parallel', async () => {
            const [sub] = await Promise.all([
                client.subscribe(streamDefinition),
                client.unsubscribe(streamDefinition),
            ])

            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages(3)

            const received = await sub.collect(3)

            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('can unsubscribe then subscribe in parallel', async () => {
            const [_, sub] = await Promise.all([
                client.unsubscribe(streamDefinition),
                client.subscribe(streamDefinition),
            ])

            expect(await getSubscriptionCount(streamDefinition)).toBe(1)

            const published = await publishTestMessages(3)

            const received = await sub.collect(3)

            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })
    })

    describe('mid-stream stop methods', () => {
        let sub1: Subscription<unknown>
        let sub2: Subscription<unknown>
        let published: StreamMessage[]

        beforeEach(async () => {
            sub1 = await client.subscribe(streamDefinition)
            sub2 = await client.subscribe(streamDefinition)
            published = await publishTestMessages(5, { delay: 50 })
        })

        it('can subscribe to stream multiple times then unsubscribe all mid-stream', async () => {
            let sub1Received: unknown[] = []
            let sub1ReceivedAtUnsubscribe: unknown[] = []
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
                        await client.unsubscribe(streamDefinition)
                        sub1ReceivedAtUnsubscribe = sub1Received.slice()
                    }
                }),
            ])
            expect(received1.map((m) => m.signature)).toEqual(published.slice(0, sub1ReceivedAtUnsubscribe.length).map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(sub1ReceivedAtUnsubscribe).toEqual(sub1Received)
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('can subscribe to stream multiple times then unsubscribe one mid-stream', async () => {
            let sub2ReceivedAtUnsubscribe
            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received, iterator }) => {
                    if (received.length === published.length) {
                        await iterator.return(undefined)
                    }
                }),
                collect(sub2, async ({ received }) => {
                    if (received.length === MAX_ITEMS) {
                        sub2ReceivedAtUnsubscribe = received.slice()
                        await sub2.unsubscribe()
                    }
                }),
            ])
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(sub2ReceivedAtUnsubscribe).toEqual(received2)
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })

        it('can subscribe to stream multiple times then return mid-stream', async () => {
            const [received1, received2] = await Promise.all([
                collect(sub1, async ({ received, iterator }) => {
                    if (received.length === MAX_ITEMS - 1) {
                        await iterator.return(undefined)
                    }
                }),
                collect(sub2, async ({ received, iterator }) => {
                    if (received.length === MAX_ITEMS) {
                        await iterator.return(undefined)
                    }
                }),
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS - 1).map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(await getSubscriptionCount(streamDefinition)).toBe(0)
        })
    })
})
