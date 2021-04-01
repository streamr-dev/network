import fs from 'fs'
import path from 'path'

import { MessageLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, Msg } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'
import { Stream } from '../../src/stream'
import { Subscription } from '../../src'

const { StreamMessage } = MessageLayer

const MAX_MESSAGES = 10

describeRepeats('StreamrClient', () => {
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: StreamrClient

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // disconnectDelay: 500,
            // publishAutoDisconnectDelay: 250,
            // @ts-expect-error
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    beforeAll(async () => {
        await checkConnection()
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('StreamrClient', () => {
        let stream: Stream
        let waitForStorage: (...args: any[]) => Promise<void>
        let publishTestMessages: ReturnType<typeof getPublishTestMessages>

        // These tests will take time, especially on Travis
        const TIMEOUT = 30 * 1000
        const WAIT_TIME = 600

        const attachSubListeners = (sub: Subscription) => {
            const onSubscribed = jest.fn()
            sub.on('subscribed', onSubscribed)
            const onResent = jest.fn()
            sub.on('resent', onResent)
            const onUnsubscribed = jest.fn()
            sub.on('unsubscribed', onUnsubscribed)
            return {
                onSubscribed,
                onUnsubscribed,
                onResent,
            }
        }

        const createStream = async ({ requireSignedData = true, ...opts } = {}) => {
            const name = uid('stream')
            const s = await client.createStream({
                name,
                requireSignedData,
                ...opts,
            })
            await s.addToStorageNode(config.clientOptions.storageNode.address)

            expect(s.id).toBeTruthy()
            expect(s.name).toEqual(name)
            expect(s.requireSignedData).toBe(requireSignedData)
            return s
        }

        beforeEach(async () => {
            client = createClient()
            await Promise.all([
                client.session.getSessionToken(),
                client.connect(),
            ])
            stream = await createStream()
            publishTestMessages = getPublishTestMessages(client, {
                stream,
            })
            waitForStorage = getWaitForStorage(client, {
                stream,
            })
            expect(onError).toHaveBeenCalledTimes(0)
        })

        afterEach(async () => {
            await wait(0)
            // ensure no unexpected errors
            expect(onError).toHaveBeenCalledTimes(expectErrors)
        })

        afterEach(async () => {
            await wait(0)

            if (client) {
                client.debug('disconnecting after test')
                await client.disconnect()
            }

            const openSockets = Connection.getOpen()
            if (openSockets !== 0) {
                await Connection.closeOpen()
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        it('is stream publisher', async () => {
            const publisherId = await client.getUserId()
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
                    expect(client.getSubscriptions()).toHaveLength(0)
                })

                it('client.subscribe then unsubscribe after subscribed', async () => {
                    const sub = await client.subscribe({
                        streamId: stream.id,
                    }, () => {})

                    const events = attachSubListeners(sub)

                    expect(client.getSubscriptions()).toHaveLength(1) // has subscription immediately
                    expect(client.getSubscriptions()).toHaveLength(1)
                    await client.unsubscribe(sub)
                    expect(client.getSubscriptions()).toHaveLength(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(1)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed', async () => {
                    client.connection.enableAutoDisconnect(false)
                    const subTask = client.subscribe({
                        streamId: stream.id,
                    }, () => {})

                    const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))

                    expect(client.getSubscriptions()).toHaveLength(1)

                    // @ts-expect-error
                    const unsubTask = client.unsubscribe(stream)

                    expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                    await unsubTask
                    await subTask
                    await wait(WAIT_TIME)
                    expect(events.onResent).toHaveBeenCalledTimes(0)
                    expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                    expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                }, TIMEOUT)

                it('client.subscribe then unsubscribe before subscribed after started subscribing', async () => {
                    client.connection.enableAutoDisconnect(false)
                    const subTask = client.subscribe({
                        streamId: stream.id,
                    }, () => {})
                    const subSession = client.subscriber.getSubscriptionSession(stream)
                    const events = attachSubListeners(subSession)
                    let unsubTask
                    const startedSubscribing = Defer()
                    subSession.once('subscribing', startedSubscribing.wrap(() => {
                        // @ts-expect-error
                        unsubTask = client.unsubscribe(stream)
                    }))

                    await Promise.all([
                        startedSubscribing,
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

                        const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))

                        expect(client.getSubscriptions()).toHaveLength(1)

                        // @ts-expect-error
                        const unsubTask = client.unsubscribe(stream)

                        expect(client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                        console.log('unsub >>')
                        await unsubTask
                        console.log('unsub <<')
                        console.log('sub >>')
                        await subTask
                        console.log('sub <<')
                        console.log('wait >>')
                        await wait(WAIT_TIME * 2)
                        console.log('wait <<')
                        expect(events.onResent).toHaveBeenCalledTimes(0)
                        expect(events.onSubscribed).toHaveBeenCalledTimes(0)
                        expect(events.onUnsubscribed).toHaveBeenCalledTimes(0)
                    }, TIMEOUT)

                    it('client.subscribe then unsubscribe ignores messages with resend', async () => {
                        console.log('NEXT')
                        const onMessage = jest.fn()
                        const subTask = client.subscribe({
                            streamId: stream.id,
                            resend: {
                                from: {
                                    timestamp: 0,
                                },
                            },
                        }, onMessage)

                        const events = attachSubListeners(client.subscriber.getSubscriptionSession(stream))
                        // @ts-expect-error
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

            it('client.subscribe (realtime)', async () => {
                const id = Date.now()
                const done = Defer()
                const sub = await client.subscribe({
                    streamId: stream.id,
                }, done.wrap(async (parsedContent, streamMessage) => {
                    expect(parsedContent.id).toBe(id)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                }))

                // Publish after subscribed
                await stream.publish({
                    id,
                })
                await done
                // All good, unsubscribe
                await client.unsubscribe(sub)
            })

            it('client.subscribe with onMessage & collect', async () => {
                const onMessageMsgs: any[] = []
                const sub = await client.subscribe({
                    streamId: stream.id,
                }, async (msg) => {
                    onMessageMsgs.push(msg)
                })

                const published = await publishTestMessages(MAX_MESSAGES)
                await expect(async () => sub.collect(1)).rejects.toThrow('iterate')
                expect(onMessageMsgs).toEqual(published)
            })

            it('publish and subscribe a sequence of messages', async () => {
                client.enableAutoConnect()
                const done = Defer()
                const received: any[] = []
                const sub = await client.subscribe({
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
                const published = await publishTestMessages(MAX_MESSAGES, {
                    wait: 100,
                })

                await done
                expect(received).toEqual(published)
            })

            test('publish does not disconnect after each message with autoDisconnect', async () => {
                await client.disconnect()
                const onConnected = jest.fn()
                const onDisconnected = jest.fn()
                client.on('disconnected', onDisconnected)
                client.on('connected', onConnected)

                // @ts-expect-error
                client.options.publishAutoDisconnectDelay = 1000 // eslint-disable-line require-atomic-updates

                client.enableAutoConnect()
                client.enableAutoDisconnect()
                await publishTestMessages(3, {
                    delay: 150,
                })

                // @ts-expect-error
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

        describe('utf-8 encoding', () => {
            it('decodes realtime messages correctly', async () => {
                const publishedMessage = Msg({
                    content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
                })
                const sub = await client.subscribe(stream.id)
                await client.publish(stream.id, publishedMessage)
                const messages = await sub.collect(1)
                expect(messages).toEqual([publishedMessage])
            })

            it('decodes resent messages correctly', async () => {
                const publishedMessage = Msg({
                    content: fs.readFileSync(path.join(__dirname, 'utf8Example.txt'), 'utf8')
                })
                const publishReq = await client.publish(stream.id, publishedMessage)
                await waitForStorage(publishReq)
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        last: 3,
                    },
                })
                const messages = await sub.collect()
                expect(messages).toEqual([publishedMessage])
            }, 10000)
        })
    })
})
