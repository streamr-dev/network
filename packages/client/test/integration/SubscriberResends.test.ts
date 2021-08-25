import { wait } from 'streamr-test-utils'

import {
    describeRepeats,
    fakePrivateKey,
    getWaitForStorage,
    getPublishTestMessages,
    createTestStream
} from '../utils'
import { StreamrClient } from '../../src/StreamrClient'

import clientOptions from './config'
import { Stream } from '../../src/Stream'
import Resends from '../../src/Resends'
import { StorageNode } from '../../src/StorageNode'

// eslint-disable no-await-in-loop

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 12000 : 6000
const MAX_MESSAGES = 5

describeRepeats('resends', () => {
    let client: StreamrClient
    let stream: Stream
    let published: any[]
    let publishedRequests: any[]
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let waitForStorage: (...args: any[]) => Promise<void>
    let subscriber: Resends

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            publishAutoDisconnectDelay: 1000,
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
        return c
    }

    beforeAll(async () => {
        client = createClient()
        subscriber = client.resends

        // eslint-disable-next-line require-atomic-updates
        client.debug('connecting before all tests >>')
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        client.debug('connecting before all tests <<')
        client.debug('createStream >>')
        stream = await createTestStream(client, module)
        client.debug('createStream <<')
    })

    beforeAll(async () => {
        client.debug('addToStorageNode >>')
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV, {
            timeout: WAIT_FOR_STORAGE_TIMEOUT * 2,
        })
        client.debug('addToStorageNode <<')

        publishTestMessages = getPublishTestMessages(client, stream)

        waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
        })
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    afterAll(async () => {
        if (client) {
            client.debug('disconnecting after test')
            await client.destroy()
        }
        client.debug('\n\n\n\n')
    })

    describe('no data', () => {
        let emptyStream: Stream

        it('throws error if bad stream id', async () => {
            await expect(async () => {
                await subscriber.resend({
                    streamId: 'badstream',
                    last: 5,
                })
            }).rejects.toThrow('badstream')
        })

        it('throws error if no resend config', async () => {
            emptyStream = await createTestStream(client, module)
            await emptyStream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
            await expect(async () => {
                await subscriber.resend({
                    streamId: emptyStream.id,
                    // @ts-expect-error invalid
                    resend: {},
                })
            }).rejects.toThrow('without resend options')
        })

        it('handles nothing to resend', async () => {
            emptyStream = await createTestStream(client, module)
            await emptyStream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

            const sub = await subscriber.resend({
                streamId: emptyStream.id,
                last: 5,
            })

            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(0)
        })

        /**
        it('resendSubscribe with nothing to resend', async () => {
            emptyStream = await createTestStream(client, module)
            await emptyStream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

            const sub = await subscriber.resendSubscribe({
                streamId: emptyStream.id,
                last: 5,
            })

            const onResent = jest.fn()
            sub.on('resent', onResent)

            expect(subscriber.count(emptyStream.id)).toBe(1)
            const msg = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(emptyStream.id, msg)

            const received = []
            let t!: ReturnType<typeof setTimeout>
            try {
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    clearTimeout(t)
                    t = testSetTimeout(() => {
                        sub.cancel()
                    }, 250)
                }
            } finally {
                clearTimeout(t)
            }

            expect(onResent).toHaveBeenCalledTimes(1)
            expect(received).toEqual([msg])
            expect(subscriber.count(emptyStream.id)).toBe(0)
        })
        */
    })

    describe('with resend data', () => {
        beforeAll(async () => {
            await client.connect()
        })

        beforeAll(async () => {
            published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
                timestamp: 111111,
            })
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        beforeEach(async () => {
            await client.connect()
            // ensure last message is in storage
            const lastRequest = publishedRequests[publishedRequests.length - 1]
            await waitForStorage(lastRequest)
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        it('requests resend', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: published.length,
            })

            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(published.length)
            expect(receivedMsgs).toEqual(published)
        })

        it('requests resend number', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: 2,
            })

            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(2)
            expect(receivedMsgs).toEqual(published.slice(-2))
        })

        it('closes stream', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: published.length,
            })

            const received = []
            for await (const m of sub) {
                received.push(m)
            }

            expect(received).toHaveLength(published.length)
            // expect(sub.msgStream.isReadable()).toBe(false)
        })

        /**
        it('closes connection with autoDisconnect', async () => {
            addAfter(() => {
                client.connection.enableAutoConnect(false)
                client.connection.enableAutoDisconnect(false)
            })
            client.connection.enableAutoConnect()
            client.connection.enableAutoDisconnect(0) // set 0 delay
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: published.length,
            })

            const onResent = jest.fn()
            sub.on('resent', onResent)

            const received = []
            for await (const m of sub) {
                received.push(m)
            }

            await wait(1000) // wait for publish delay

            expect(client.connection.getState()).toBe('disconnected')
            expect(subscriber.count(stream.id)).toBe(0)
            expect(sub.msgStream.isReadable()).toBe(false)
            expect(received).toHaveLength(published.length)
            expect(onResent).toHaveBeenCalledTimes(1)
        })
        */
        /*
        describe('resendSubscribe', () => {
            it('sees resends and realtime', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const onResent = Defer()
                const publishedBefore = published.slice()
                const receivedMsgs: any[] = []

                sub.on('resent', onResent.wrap(() => {
                    expect(receivedMsgs).toEqual(publishedBefore)
                }))

                const newMessage = Msg()
                // eslint-disable-next-line no-await-in-loop
                const req = await client.publish(stream.id, newMessage, 222222) // should be realtime
                published.push(newMessage)
                publishedRequests.push(req)
                let t!: ReturnType<typeof setTimeout>
                for await (const msg of sub) {
                    receivedMsgs.push(msg.getParsedContent())
                    if (receivedMsgs.length === published.length) {
                        await sub.return()
                        clearTimeout(t)
                        t = testSetTimeout(() => {
                            // await wait() // give resent event a chance to fire
                            onResent.reject(new Error('resent never called'))
                        }, 250)
                    }
                }

                await onResent
                clearTimeout(t)

                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.realtime.isWritable()).toBe(false)
                expect(sub.resend.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })

            it('sees resends when no realtime', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const onResent = Defer()
                const publishedBefore = published.slice()
                const receivedMsgs: any[] = []

                sub.once('resent', onResent.wrap(() => {
                    expect(receivedMsgs).toEqual(publishedBefore)
                }))

                for await (const msg of sub) {
                    receivedMsgs.push(msg.getParsedContent())
                    if (receivedMsgs.length === published.length) {
                        await sub.return()
                    }
                }

                await onResent

                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.realtime.isWritable()).toBe(false)
                expect(sub.resend.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })

            it('ends resend if unsubscribed', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                const req = await client.publish(stream.id, message, 444444) // should be realtime
                published.push(message)
                publishedRequests.push(req)
                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub.return()
                    }
                })

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.realtime.isWritable()).toBe(false)
                expect(sub.resend.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })

            it('can return before start', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                expect(subscriber.count(stream.id)).toBe(1)
                const message = Msg()

                await sub.return()
                // eslint-disable-next-line no-await-in-loop
                const req = await client.publish(stream.id, message, 555555) // should be realtime
                published.push(message)
                publishedRequests.push(req)
                const received = []
                for await (const m of sub) {
                    received.push(m)
                }

                expect(received).toHaveLength(0)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })

            it('can end asynchronously', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                const req = await client.publish(stream.id, message, 666666) // should be realtime
                published.push(message)
                publishedRequests.push(req)

                let t!: ReturnType<typeof setTimeout>
                let receivedMsgs: any[]
                try {
                    receivedMsgs = await collect(sub, async ({ received }) => {
                        if (received.length === published.length) {
                            t = testSetTimeout(() => {
                                sub.cancel()
                            })
                        }
                    })
                } finally {
                    clearTimeout(t)
                }

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })

            it('can end inside resend', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                const req = await client.publish(stream.id, message, 777777) // should be realtime
                published.push(message)
                publishedRequests.push(req)
                const END_AFTER = 3
                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === END_AFTER) {
                        await sub.cancel()
                    }
                })
                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs).toEqual(published.slice(0, END_AFTER))
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.isReadable()).toBe(false)
                expect(sub.resend.isWritable()).toBe(false)
            })
        })
        */
    })
})
