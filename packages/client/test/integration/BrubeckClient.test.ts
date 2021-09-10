import fs from 'fs'
import path from 'path'

import { MessageLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import {
    uid,
    Msg,
    getPublishTestMessages,
    getPublishTestStreamMessages,
    getWaitForStorage,
    publishManyGenerator,
    describeRepeats,
    createRelativeTestStreamId,
    getCreateClient,
} from '../utils'

import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import * as G from '../../src/utils/GeneratorUtils'

import { Stream } from '../../src/Stream'
// import Subscription from '../../src/brubeck/Subscription'
import { StorageNode } from '../../src/StorageNode'

const { StreamMessage } = MessageLayer

const MAX_MESSAGES = 10

describeRepeats('StreamrClient', () => {
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    // const trackerPort = useTracker()
    let onError = jest.fn()
    let client: StreamrClient

    const createClient = getCreateClient()

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
    })

    let stream: Stream
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>

    // These tests will take time, especially on Travis
    const TIMEOUT = 30 * 1000
    const WAIT_TIME = 600

    const createStream = async ({ requireSignedData = true, ...opts }: any = {}) => {
        const name = uid('stream')
        const s = await client.createStream({
            id: createRelativeTestStreamId(module),
            name,
            requireSignedData,
            ...opts,
        })

        expect(s.id).toBeTruthy()
        expect(s.name).toEqual(name)
        expect(s.requireSignedData).toBe(requireSignedData)
        return s
    }

    beforeEach(async () => {
        client = createClient()
        await Promise.all([
            client.getSessionToken(),
            client.connect(),
        ])
        stream = await createStream()
        publishTestMessages = getPublishTestMessages(client, stream)
        expect(onError).toHaveBeenCalledTimes(0)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
    })

    it('is stream publisher', async () => {
        const publisherId = await client.getAddress()
        const res = await client.isStreamPublisher(stream.id, publisherId)
        expect(res).toBe(true)
    })

    describe('Pub/Sub', () => {
        it('client.publish does not error', async () => {
            await client.publish(stream.id, {
                test: 'client.publish',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        it('Stream.publish does not error', async () => {
            await stream.publish({
                test: 'Stream.publish',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        it('client.publish with Stream object as arg', async () => {
            await client.publish(stream, {
                test: 'client.publish.Stream.object',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        describe('subscribe/unsubscribe', () => {
            beforeEach(() => {
                expect(client.getAllSubscriptions()).toHaveLength(0)
            })

            it('client.subscribe then unsubscribe after subscribed', async () => {
                const subTask = client.subscribe<{ test: string }>({
                    streamId: stream.id,
                }, () => {})
                expect(client.subscriber.getSubscriptions()).toHaveLength(1) // has subscription immediately

                const sub = await subTask

                expect(client.getSubscriptions()).toHaveLength(1)
                await client.unsubscribe(sub)
                expect(client.subscriber.getSubscriptions()).toHaveLength(0)
            }, TIMEOUT)

            it('client.subscribe then unsubscribe before subscribed', async () => {
                const subTask = client.subscribe({
                    streamId: stream.id,
                }, () => {})

                expect(client.getSubscriptions()).toHaveLength(1)

                const unsubTask = client.unsubscribe(stream)

                expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                await unsubTask
                await subTask
                await wait(WAIT_TIME)
            }, TIMEOUT)
        })

        it('client.subscribe (realtime) with onMessage signal', async () => {
            const done = Defer()
            const msg = Msg()

            const sub = await client.subscribe<typeof msg>({
                streamId: stream.id,
            })

            sub.onMessage(done.wrap(async (streamMessage) => {
                sub.unsubscribe()
                const parsedContent = streamMessage.getParsedContent()
                expect(parsedContent).toEqual(msg)

                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
            }))

            // Publish after subscribed
            await client.publish(stream, msg)
            await sub.consume()
            await done
        })

        it('client.subscribe (realtime) with onMessage callback', async () => {
            const done = Defer()
            const msg = Msg()
            await client.subscribe<typeof msg>({
                streamId: stream.id,
            }, done.wrap(async (parsedContent, streamMessage) => {
                expect(parsedContent).toEqual(msg)

                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
            }))

            // Publish after subscribed
            await client.publish(stream, msg)
            await done
        })

        it('client.subscribe with onMessage & collect', async () => {
            const onMessageMsgs: any[] = []
            const done = Defer()
            const sub = await client.subscribe<typeof Msg>({
                streamId: stream.id,
            }, async (msg) => {
                onMessageMsgs.push(msg)
                if (onMessageMsgs.length === MAX_MESSAGES) {
                    done.resolve(undefined)
                }
            })

            const published = await publishTestMessages(MAX_MESSAGES)
            await expect(async () => sub.collect(1)).rejects.toThrow()
            await done
            expect(onMessageMsgs).toEqual(published)
        })

        it('client.subscribe with onMessage callback that throws', async () => {
            const onMessageMsgs: any[] = []
            const err = new Error('expected error')
            const sub = await client.subscribe<typeof Msg>({
                streamId: stream.id,
            }, async (msg) => {
                onMessageMsgs.push(msg)

                if (onMessageMsgs.length === MAX_MESSAGES) {
                    sub.return()
                }
                throw err
            })

            const published = await publishTestMessages(MAX_MESSAGES)
            await sub.onFinally()
            expect(onMessageMsgs).toEqual(published.slice(0, 1))
        })

        it('publish and subscribe a sequence of messages', async () => {
            const done = Defer()
            const received: typeof Msg[] = []
            const sub = await client.subscribe<typeof Msg>({
                streamId: stream.id,
            }, done.wrapError((parsedContent, streamMessage) => {
                received.push(parsedContent)
                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
                if (received.length === MAX_MESSAGES) {
                    done.resolve(client.unsubscribe(sub))
                }
            }))

            // Publish after subscribed
            const published = await publishTestMessages(MAX_MESSAGES)

            await done
            expect(received).toEqual(published)
        })

        describe('partitioning', () => {
            it('pub/sub with numeric partition key', async () => {
                const NUM_PARTITIONS = 3
                const NUM_MESSAGES = 3
                // create a new stream with multiple partitions
                const partitionStream = await createStream({
                    partitions: NUM_PARTITIONS
                })

                const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)
                const eachPartition = Array(NUM_PARTITIONS).fill(0).map((_v, streamPartition) => streamPartition)

                // subscribe to each partition
                const subs = await Promise.all(eachPartition.map((streamPartition) => {
                    return client.subscribe<typeof Msg>({
                        streamId: partitionStream.id,
                        streamPartition,
                    })
                }))

                // publish to each partition
                const pubs = await Promise.all(eachPartition.map((streamPartition) => {
                    return publishTestStreamMessages(NUM_MESSAGES, { partitionKey: streamPartition })
                }))

                // check messages match
                expect(await Promise.all(subs.map((s) => s.collect(NUM_MESSAGES)))).toEqual(pubs)
                // check all published messages have appropriate partition
                // i.e. [[0,0,0], [1,1,1], etc]
                expect(pubs.map((msgs) => msgs.map((msg) => msg.getStreamPartition())))
                    .toEqual(pubs.map((msgs, index) => msgs.map(() => index)))
            })
        })

        it('destroying stops publish', async () => {
            const subscriber = createClient({
                auth: client.options.auth,
            })
            const sub = await subscriber.subscribe({
                streamId: stream.id,
            })

            const onMessage = jest.fn()
            const gotMessages = Defer()
            const published: any[] = []
            client.publisher.publishQueue.onMessage(async ([streamMessage]) => {
                if (!streamMessage.spid.matches(stream.id)) { return }
                onMessage()
                published.push(streamMessage.getParsedContent())
                if (published.length === 3) {
                    await gotMessages
                    await client.destroy()
                }
            })

            const received: any[] = []
            const publishTask = (async () => {
                for (let i = 0; i < MAX_MESSAGES; i += 1) {
                    // eslint-disable-next-line no-await-in-loop
                    await client.publish(stream.id, Msg())
                }
            })()
            publishTask.catch(() => {})
            for await (const msg of sub) {
                received.push(msg)
                if (received.length === 3) {
                    gotMessages.resolve(undefined)
                    setTimeout(() => { sub.unsubscribe() }, 500)
                }
            }
            await expect(async () => {
                await publishTask
            }).rejects.toThrow('publish')
            expect(received.map((s) => s.getParsedContent())).toEqual(published.slice(0, 3))
            expect(onMessage).toHaveBeenCalledTimes(3)
        })

        it('destroying resolves publish promises', async () => {
            // the subscriber side of this test is partially disabled as we
            // can't yet reliably publish messages then disconnect and know
            // that subscriber will actually get something.
            // Probably needs to wait for propagation.
            const subscriber = createClient({
                auth: client.options.auth,
            })

            const received: any[] = []
            // const gotMessage = Defer()
            await subscriber.subscribe({
                streamId: stream.id,
            }, (msg) => {
                received.push(msg)
                // gotMessage.resolve(undefined)
            })

            const msgs = await G.collect(publishManyGenerator(MAX_MESSAGES))

            const publishTasks = [
                client.publishMessage(stream.id, msgs[0]).finally(async () => {
                    await client.destroy()
                }),
                client.publishMessage(stream.id, msgs[1]),
                client.publishMessage(stream.id, msgs[2]),
                client.publishMessage(stream.id, msgs[3]),
            ]
            const results = await Promise.allSettled(publishTasks)
            client.debug('publishTasks', results.map(({ status }) => status))
            expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected'])
            await wait(500)
            client.debug('received', received)
            // should probably get every publish that was fulfilled, right?
            // expect(received).toEqual([msgs[0].content])
        })

        it('cannot subscribe or publish after destroy', async () => {
            await client.destroy()
            await expect(async () => {
                await client.subscribe(stream.id)
            }).rejects.toThrow('destroy')
            await expect(async () => {
                await client.publish(stream.id, Msg())
            }).rejects.toThrow('destroy')
            await expect(async () => {
                await client.connect()
            }).rejects.toThrow('destroy')
        })
    })

    describe('utf-8 encoding', () => {
        it('decodes realtime messages correctly', async () => {
            const publishedMessage = Msg({
                content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
            })
            const sub = await client.subscribe(stream.id)
            await client.publish(stream.id, publishedMessage)
            const messages = await sub.collect(1)
            expect(messages.map((s) => s.getParsedContent())).toEqual([publishedMessage])
        })

        it('decodes resent messages correctly', async () => {
            await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
            const publishedMessage = Msg({
                content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
            })
            const publishReq = await client.publish(stream.id, publishedMessage)

            await getWaitForStorage(client)(publishReq)
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 3,
                },
            })
            const messages = await sub.collectContent()
            expect(messages).toEqual([publishedMessage])
        }, 20000)
    })
})

/*
            it('client.subscribe then unsubscribe before subscribed after started subscribing', async () => {
                const subTask = client.subscribe({
                    streamId: stream.id,
                }, () => {})
                const subSession = client.subscriber.getSubscriptionSession(stream)!
                let unsubTask!: ReturnType<typeof client.unsubscribe>
                const startedSubscribing = Defer()
                subSession.once('subscribing', startedSubscribing.wrap(() => {
                    unsubTask = client.unsubscribe(stream)
                }))

                await startedSubscribing
                await Promise.all([
                    unsubTask,
                    subTask,
                ])
                expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                await wait(WAIT_TIME)
                expect(events.onResent).toHaveBeenCalledTimes(0)
                expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
            }, TIMEOUT)

            describe('with resend', () => {
                it('client.subscribe then unsubscribe before subscribed', async () => {
                    client.connection.enableAutoDisconnect(false)
                    const subTask = client.subscribe({
                        streamId: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, () => {})

                    const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream)!)

                    expect(client.getSubscriptions()).toHaveLength(1)

                    const unsubTask = client.unsubscribe(stream)

                    expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                    await unsubTask
                    await subTask
                    await wait(WAIT_TIME * 2)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe ignores messages with resend', async () => {
                    const onMessage = jest.fn()
                    const subTask = client.subscribe({
                        streamId: stream.id,
                        resend: {
                            from: {
                                timestamp: 0,
                            },
                        },
                    }, onMessage)

                    const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream)!)
                    const unsubTask = client.unsubscribe(stream)
                    expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately

                    const msg = Msg()
                    const publishReq = await stream.publish(msg)
                    await waitForStorage(publishReq)

                    await unsubTask
                    await subTask
                    await wait(WAIT_TIME)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                    expect(onMessage).toHaveBeenCalledTimes(0)
                }, TIMEOUT)
            })

            it('client.subscribe then unsubscribe ignores messages', async () => {
                const onMessage = jest.fn()
                const sub = await client.subscribe({
                    streamId: stream.id,
                }, onMessage)

                expect(client.getSubscriptions()).toHaveLength(1)
                const events = attachSubListeners(sub)
                const t = client.unsubscribe(sub)
                await stream.publish(Msg())
                await t
                expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                await wait(WAIT_TIME)
                expect(events.onResent).toHaveBeenCalledTimes(0)
                expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
            }, TIMEOUT)
        })

        test('publish does not disconnect after each message with autoDisconnect', async () => {
            await client.disconnect()
            const onConnected = jest.fn()
            const onDisconnected = jest.fn()
            client.on('disconnected', onDisconnected)
            client.on('connected', onConnected)

            client.options.publishAutoDisconnectDelay = 1000 // eslint-disable-line require-atomic-updates

            client.enableAutoConnect()
            client.enableAutoDisconnect()
            await publishTestMessages(3, {
                delay: 150,
            })

            await wait(client.options.publishAutoDisconnectDelay * 1.5)

            expect(onConnected).toHaveBeenCalledTimes(1)
            expect(onDisconnected).toHaveBeenCalledTimes(1)
        })

        it('client.subscribe with resend from', async () => {
            const done = Defer()
            const published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
            })

            const received: any[] = []

            const sub = await client.subscribe({
                streamId: stream.id,
                resend: {
                    from: {
                        timestamp: 0,
                    },
                },
            }, done.wrapError(async (parsedContent, streamMessage) => {
                received.push(parsedContent)

                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
                if (received.length === published.length) {
                    done.resolve(undefined)
                }
            }))

            await done
            expect(received).toEqual(published)
            // All good, unsubscribe
            await client.unsubscribe(sub)
            expect(client.getSubscriptions()).toHaveLength(0)
        }, TIMEOUT)

        it('client.subscribe with resend last', async () => {
            const done = Defer()
            const published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
            })

            const received: any[] = []

            const sub = await client.subscribe({
                streamId: stream.id,
                resend: {
                    last: 2
                },
            }, done.wrapError(async (parsedContent, streamMessage) => {
                received.push(parsedContent)
                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
                if (received.length === 2) {
                    done.resolve(undefined)
                }
            }))

            await done
            // All good, unsubscribe
            await client.unsubscribe(sub)
            expect(received).toEqual(published.slice(-2))
            expect(client.getSubscriptions()).toHaveLength(0)
        }, TIMEOUT)

        it('client.subscribe (realtime with resend)', async () => {
            const done = Defer()
            const published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
            })

            const received: any[] = []

            const sub = await client.subscribe({
                streamId: stream.id,
                resend: {
                    last: 2
                },
            }, done.wrapError(async (parsedContent, streamMessage) => {
                received.push(parsedContent)
                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
                if (received.length === 3) {
                    done.resolve(undefined)
                }
            }))

            const [msg] = await publishTestMessages(1)

            await done
            // All good, unsubscribe
            await client.unsubscribe(sub)
            expect(received).toEqual([...published.slice(-2), msg])
            expect(client.getSubscriptions()).toHaveLength(0)
        }, TIMEOUT)
    })

})
*/
