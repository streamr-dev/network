import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages, collect } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'

const { ControlMessage } = ControlLayer

const MAX_ITEMS = 2
const NUM_MESSAGES = 6

describeRepeats('Subscriber', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client
    let stream
    let M
    let publishTestMessages

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
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
        M = client.subscriber
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        stream = await client.createStream({
            name: uid('stream')
        })
        await stream.addToStorageNode(config.clientOptions.storageNode.address)
        client.debug('connecting before test <<')
        publishTestMessages = getPublishTestMessages(client, {
            stream
        })
    })

    afterEach(() => {
        expect(M.count(stream.id)).toBe(0)
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
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    it('attaches listener at subscribe time', async () => {
        const beforeCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
        const sub = await M.subscribe(stream.id)
        const afterCount = client.connection.listenerCount(ControlMessage.TYPES.BroadcastMessage)
        expect(afterCount).toBeGreaterThan(beforeCount)
        expect(M.count(stream.id)).toBe(1)
        await sub.cancel()
    })

    describe('basics', () => {
        it('works when passing stream', async () => {
            const sub = await M.subscribe(stream)
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

        it('errors if not connected', async () => {
            await client.disconnect()
            await expect(() => (
                M.subscribe(stream)
            )).rejects.toThrow('connect')
            expect(M.count(stream.id)).toBe(0)
        })

        it('errors if iterating twice', async () => {
            const sub = await M.subscribe(stream)
            const c1 = sub.collect()

            await expect(async () => (
                sub.collect()
            )).rejects.toThrow('iterate')

            const [, m] = await Promise.all([
                sub.cancel(),
                c1,
            ])

            expect(m).toEqual([])

            expect(M.count(stream.id)).toBe(0)
        })

        describe('subscription error handling', () => {
            it('works when error thrown inline', async () => {
                const err = new Error('expected')

                const sub = await M.subscribe({
                    ...stream,
                    afterSteps: [
                        async function* ThrowError(s) {
                            let count = 0
                            for await (const msg of s) {
                                if (count === MAX_ITEMS) {
                                    throw err
                                }
                                count += 1
                                yield msg
                            }
                        }
                    ]
                })

                expect(M.count(stream.id)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received = []
                await expect(async () => {
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                    }
                }).rejects.toThrow(err)
                expect(received).toEqual(published.slice(0, MAX_ITEMS))
            })

            it('works when multiple steps error', async () => {
                const err = new Error('expected')

                const sub = await M.subscribe({
                    ...stream,
                    afterSteps: [
                        async function* ThrowError1(s) {
                            let count = 0
                            for await (const msg of s) {
                                if (count === MAX_ITEMS) {
                                    throw err
                                }
                                count += 1
                                yield msg
                            }
                        },
                        async function* ThrowError2(s) {
                            let count = 0
                            for await (const msg of s) {
                                if (count === MAX_ITEMS) {
                                    throw err
                                }
                                count += 1
                                yield msg
                            }
                        }
                    ]
                })

                expect(M.count(stream.id)).toBe(1)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    timestamp: 111111,
                })

                const received = []
                await expect(async () => {
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                    }
                }).rejects.toThrow(err)
                expect(received).toEqual(published.slice(0, MAX_ITEMS))
            })

            describe('error is bad groupkey', () => {
                let sub
                const BAD_GROUP_KEY_ID = 'BAD_GROUP_KEY_ID'

                beforeEach(async () => {
                    await client.publisher.startKeyExchange()
                    sub = await M.subscribe({
                        ...stream,
                        beforeSteps: [
                            async function* ThrowError(s) {
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

                    const received = []
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
                    let t
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === published.length - 1) {
                            // eslint-disable-next-line no-loop-func
                            t = setTimeout(() => {
                                // give it a moment to incorrectly get messages
                                sub.cancel()
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

                    const received = []
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
        })
    })

    describe('ending a subscription', () => {
        it('can kill stream using async end', async () => {
            const unsubscribeEvents = []
            client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                unsubscribeEvents.push(m)
            })

            const sub = await M.subscribe(stream.id)
            expect(M.count(stream.id)).toBe(1)

            await publishTestMessages()
            let t
            let expectedLength
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
                            sub.cancel()
                        })
                    }
                }
            } finally {
                clearTimeout(t)
            }
            // gets some messages but not all
            expect(received).toHaveLength(expectedLength)
            expect(unsubscribeEvents).toHaveLength(1)
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
                    received.push(m.getParsedContent())
                    // after first message schedule end
                    if (received.length === 1) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)
            // gets some messages but not all
            expect(received).toHaveLength(1)
            expect(unsubscribeEvents).toHaveLength(1)
        })

        it('can subscribe to stream multiple times, get updates then unsubscribe', async () => {
            const send = jest.spyOn(M.client.connection, 'send')
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

            // subscribed once
            expect(send.mock.calls.filter(([msg]) => (
                msg.type === ControlMessage.TYPES.SubscribeRequest
            ))).toHaveLength(1)
        })

        it('can subscribe to stream multiple times in parallel, get updates then unsubscribe', async () => {
            const send = jest.spyOn(M.client.connection, 'send')
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

            // subscribed once
            expect(send.mock.calls.filter(([msg]) => (
                msg.type === ControlMessage.TYPES.SubscribeRequest
            ))).toHaveLength(1)
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

            expect(M.count(stream.id)).toBe(0)

            await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
            }

            // shouldn't get any messages
            expect(received).toHaveLength(0)
            expect(unsubscribeEvents).toHaveLength(0)
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
