import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { Defer, StreamID, collect, utf8ToBinary, until, toUserId } from '@streamr/utils'
import sample from 'lodash/sample'
import shuffle from 'lodash/shuffle'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { Message, MessageMetadata } from '../../src/Message'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { StreamMessageTranslator } from '../../src/protocol/StreamMessageTranslator'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { Subscription } from '../../src/subscribe/Subscription'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

const MAX_ITEMS = 3
const NUM_MESSAGES = 8

const collect2 = async (
    iterator: AsyncIterable<Message>,
    fn: (item: { msg: Message; received: Message[] }) => Promise<void>
): Promise<Message[]> => {
    const received: Message[] = []
    for await (const msg of iterator) {
        received.push(msg)
        await fn({
            msg,
            received
        })
    }
    return received
}

describe('Subscriber', () => {
    let client: StreamrClient
    let streamId: StreamID
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let publisher: StreamrClient
    let messageSigner: MessageSigner
    let environment: FakeEnvironment

    const getSubscriptionCount = async (def?: StreamID) => {
        const subcriptions = await client.getSubscriptions(def !== undefined ? { id: def } : undefined)
        return subcriptions.length
    }

    const createMockMessage = async (content: Uint8Array, timestamp: number) => {
        return await messageSigner.createSignedMessage(
            {
                messageId: new MessageID(
                    streamId,
                    0,
                    timestamp,
                    0,
                    toUserId(await publisher.getUserId()),
                    'msgChainId'
                ),
                messageType: StreamMessageType.MESSAGE,
                content,
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE
            },
            SignatureType.SECP256K1
        )
    }

    beforeAll(async () => {
        environment = new FakeEnvironment()
        const publisherWallet = fastWallet()
        publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        const publisherAuthentication = createPrivateKeyAuthentication(publisherWallet.privateKey)
        messageSigner = new MessageSigner(publisherAuthentication)
    })

    afterAll(async () => {
        await environment.destroy()
    })

    beforeEach(async () => {
        const stream = await createTestStream(publisher, module)
        streamId = stream.id
        await publisher.grantPermissions(streamId, {
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        publishTestMessages = getPublishTestStreamMessages(publisher, streamId)
        client = environment.createClient()
    })

    afterEach(async () => {
        expect(await getSubscriptionCount()).toBe(0)
        expect(await getSubscriptionCount(streamId)).toBe(0)
        // @ts-expect-error private
        expect(client.subscriber.countSubscriptionSessions()).toBe(0)
        await client.destroy()
    })

    describe('basics', () => {
        it('works when passing stream', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            const published = await publishTestMessages(NUM_MESSAGES)

            const received = await collect(sub, published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received).toHaveLength(NUM_MESSAGES)
        })

        it('works when passing { stream: stream }', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            const published = await publishTestMessages()

            const received = await collect(sub, published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })

        it('works when passing streamId as string', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            const published = await publishTestMessages()

            const received = await collect(sub, published.length)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        it('errors if iterating twice', async () => {
            const sub = await client.subscribe(streamId)
            const c1 = collect(sub)

            await expect(async () => collect(sub)).rejects.toThrow()
            await sub.unsubscribe()
            const m = await c1

            expect(m).toEqual([])

            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        describe('subscription error handling', () => {
            it('works when error thrown inline', async () => {
                const err = new Error('expected')
                const sub = (await client.subscribe(streamId)).pipe(async function* ThrowError(s) {
                    let count = 0
                    for await (const msg of s) {
                        if (count === MAX_ITEMS) {
                            throw err
                        }
                        count += 1
                        yield msg
                    }
                })

                expect(await getSubscriptionCount(streamId)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111
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

                const sub = await client.subscribe(streamId)

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

                expect(await getSubscriptionCount(streamId)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111
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
                const sub1 = await client.subscribe(streamId)
                const sub2 = await client.subscribe(streamId)

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
                    timestamp: 111111
                })

                const onErrorHandler = jest.fn()
                sub1.onError.listen(onErrorHandler)

                await collect(sub1, NUM_MESSAGES)
                const received = await collect(sub2, NUM_MESSAGES)
                expect(onErrorHandler).toHaveBeenCalledWith(err)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(count).toEqual(MAX_ITEMS)
            })

            it('errors subscription iterator do not trigger onError', async () => {
                const err = new Error('expected')
                const sub1 = await client.subscribe(streamId)

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)

                let count = 0
                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111
                })
                const received1: Message[] = []
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
                const received1: MessageMetadata[] = []
                const sub1 = await client.subscribe(streamId, (_content, metadata) => {
                    if (count === MAX_ITEMS) {
                        throw err
                    }
                    count += 1
                    received1.push(metadata)
                })

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111
                })
                await until(() => onError1.mock.calls.length > 0)

                expect(received1.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
                expect(onError1).toHaveBeenCalledTimes(1)
            })

            it('errors in onMessage callback are not handled by other subscriptions', async () => {
                const err = new Error('expected')
                let count = 0
                const received1: any[] = []
                const sub1 = await client.subscribe(streamId, (content) => {
                    if (count === MAX_ITEMS) {
                        throw err
                    }
                    count += 1
                    received1.push(content)
                })

                const sub2 = await client.subscribe(streamId)

                const onError1 = jest.fn()
                sub1.onError.listen(onError1)
                const onError2 = jest.fn()
                sub2.onError.listen(onError2)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111
                })

                const received = await collect(sub2, NUM_MESSAGES)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(onError1).toHaveBeenCalledTimes(1)
                expect(onError1).toHaveBeenCalledWith(err)
                expect(onError2).toHaveBeenCalledTimes(0)
                expect(count).toEqual(MAX_ITEMS)
                expect(await getSubscriptionCount(streamId)).toBe(0)
            })

            it('will skip bad message if error handler attached', async () => {
                const sub = await client.subscribe(streamId)
                const onSubscriptionError = jest.fn()
                sub.on('error', onSubscriptionError)

                const published = []
                const nodeId = await publisher.getNodeId()
                const node = environment.getNetwork().getNode(nodeId)!
                for (let i = 0; i < NUM_MESSAGES; i++) {
                    const content = i === MAX_ITEMS ? 'invalid-json' : JSON.stringify({ foo: i })
                    const msg = await createMockMessage(utf8ToBinary(content), i)
                    await node.broadcast(StreamMessageTranslator.toProtobuf(msg))
                    published.push(msg)
                }

                const received: Message[] = []
                let t!: ReturnType<typeof setTimeout>
                for await (const m of sub) {
                    received.push(m)
                    if (received.length === published.length - 1) {
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
                expect(received.map((m) => m.signature)).toEqual(
                    [...published.slice(0, MAX_ITEMS), ...published.slice(MAX_ITEMS + 1)].map((m) => m.signature)
                )
                expect(onSubscriptionError).toHaveBeenCalledTimes(1)
            })
        })
    })

    describe('ending a subscription', () => {
        it('can kill stream using async unsubscribe', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            await publishTestMessages()
            let unsubscribeTask!: Promise<any>
            let t!: ReturnType<typeof setTimeout>
            let expectedLength = -1
            const received: Message[] = []
            try {
                for await (const m of sub) {
                    received.push(m)
                    // after first message schedule end
                    if (received.length === 1) {
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
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            await publishTestMessages()

            const err = new Error('expected error')
            const received: Message[] = []
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
            const sub1 = await client.subscribe(streamId)
            const sub2 = await client.subscribe(streamId)

            expect(await getSubscriptionCount(streamId)).toBe(2)

            const published = await publishTestMessages()

            const [received1, received2] = await Promise.all([
                collect2(sub1, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub1.unsubscribe()
                    }
                }),
                collect2(sub2, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub2.unsubscribe()
                    }
                })
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(received1.map((m) => m.signature))
        })

        it('can subscribe to stream multiple times in parallel, get updates then unsubscribe', async () => {
            const [sub1, sub2] = await Promise.all([client.subscribe(streamId), client.subscribe(streamId)])

            expect(await getSubscriptionCount(streamId)).toBe(2)
            const published = await publishTestMessages()

            const [received1, received2] = await Promise.all([
                collect2(sub1, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub1.unsubscribe()
                    }
                }),
                collect2(sub2, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub2.unsubscribe()
                    }
                })
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(received1.map((m) => m.signature))
        })

        it('can subscribe to stream and get some updates then unsubscribe mid-stream with end', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)

            const published = await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === 1) {
                    await sub.unsubscribe()
                }
            }

            expect(received.map((m) => m.signature)).toEqual(published.slice(0, 1).map((m) => m.signature))
            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        it('finishes unsubscribe before returning', async () => {
            const sub = await client.subscribe(streamId)

            const published = await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await sub.return()
                    expect(await getSubscriptionCount(streamId)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('finishes unsubscribe before returning from cancel', async () => {
            const sub = await client.subscribe(streamId)

            const published = await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await sub.unsubscribe()
                    expect(await getSubscriptionCount(streamId)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('can unsubscribe + return and it will wait for unsubscribe', async () => {
            const sub = await client.subscribe(streamId)

            const published = await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    await Promise.all([sub.return(), sub.unsubscribe()])
                    expect(await getSubscriptionCount(streamId)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('can cancel multiple times and it will wait for unsubscribe', async () => {
            const sub = await client.subscribe(streamId)

            const published = await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_ITEMS) {
                    const tasks = [sub.unsubscribe(), sub.unsubscribe(), sub.unsubscribe()]
                    await Promise.all(tasks)
                    expect(await getSubscriptionCount(streamId)).toBe(0)
                }
            }
            expect(received).toHaveLength(MAX_ITEMS)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
        })

        it('will clean up if iterator returned before start', async () => {
            const sub = await client.subscribe(streamId)
            expect(await getSubscriptionCount(streamId)).toBe(1)
            await sub.return()
            expect(await getSubscriptionCount(streamId)).toBe(0)

            await publishTestMessages()

            const received: Message[] = []
            for await (const m of sub) {
                received.push(m)
            }
            expect(received).toHaveLength(0)

            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        it('can subscribe and unsubscribe in parallel', async () => {
            // do subscribe and unsubscribe request in random order
            const operations = shuffle([
                () => client.subscribe(streamId),
                () => client.subscribe(streamId),
                () => client.subscribe(streamId),
                () => client.subscribe(streamId),
                () => client.subscribe(streamId),
                () => client.unsubscribe(streamId),
                () => client.unsubscribe(streamId),
                () => client.unsubscribe(streamId),
                () => client.unsubscribe(streamId),
                () => client.unsubscribe(streamId)
            ])
            await Promise.all(operations.map((o) => o()))

            // operations did not crash, and we either have some subscriptions or we don't have
            const subscriptions = await client.getSubscriptions(streamId)
            expect(subscriptions.length >= 0 && subscriptions.length <= 5).toBeTrue()
            let sub: Subscription
            if (subscriptions.length === 0) {
                sub = await client.subscribe(streamId)
            } else {
                sub = sample(subscriptions)!
            }

            const published = await publishTestMessages(3)
            const received = await collect(sub, 3)
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))

            // clean up tests so that next test cases don't have existing subcriptions
            await client.unsubscribe()
        })
    })

    describe('mid-stream stop methods', () => {
        let sub1: Subscription
        let sub2: Subscription
        let published: Message[]

        beforeEach(async () => {
            sub1 = await client.subscribe(streamId)
            sub2 = await client.subscribe(streamId)
            published = await publishTestMessages(5, { delay: 50 })
        })

        it('can subscribe to stream multiple times then unsubscribe all mid-stream', async () => {
            let sub1Received: unknown[] = []
            let sub1ReceivedAtUnsubscribe: unknown[] = []
            const gotOne = new Defer<undefined>()
            let didGetOne = false
            const [received1, received2] = await Promise.all([
                collect2(sub1, async ({ received }) => {
                    sub1Received = received
                    didGetOne = true
                    gotOne.resolve(undefined)
                }),
                collect2(sub2, async ({ received }) => {
                    if (!didGetOne) {
                        // don't delay unsubscribe
                        await gotOne
                    }

                    if (received.length === MAX_ITEMS) {
                        await client.unsubscribe(streamId)
                        sub1ReceivedAtUnsubscribe = sub1Received.slice()
                    }
                })
            ])
            expect(received1.map((m) => m.signature)).toEqual(
                published.slice(0, sub1ReceivedAtUnsubscribe.length).map((m) => m.signature)
            )
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(sub1ReceivedAtUnsubscribe).toEqual(sub1Received)
            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        it('can subscribe to stream multiple times then unsubscribe one mid-stream', async () => {
            let sub2ReceivedAtUnsubscribe
            const [received1, received2] = await Promise.all([
                collect2(sub1, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub1.unsubscribe()
                    }
                }),
                collect2(sub2, async ({ received }) => {
                    if (received.length === MAX_ITEMS) {
                        sub2ReceivedAtUnsubscribe = received.slice()
                        await sub2.unsubscribe()
                    }
                })
            ])
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(received1.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(sub2ReceivedAtUnsubscribe).toEqual(received2)
            expect(await getSubscriptionCount(streamId)).toBe(0)
        })

        it('can subscribe to stream multiple times then return mid-stream', async () => {
            const [received1, received2] = await Promise.all([
                collect2(sub1, async ({ received }) => {
                    if (received.length === MAX_ITEMS - 1) {
                        await sub1.unsubscribe()
                    }
                }),
                collect2(sub2, async ({ received }) => {
                    if (received.length === MAX_ITEMS) {
                        await sub2.unsubscribe()
                    }
                })
            ])

            expect(received1.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS - 1).map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(published.slice(0, MAX_ITEMS).map((m) => m.signature))
            expect(await getSubscriptionCount(streamId)).toBe(0)
        })
    })
})
