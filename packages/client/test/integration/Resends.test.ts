// import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import {
    describeRepeats,
    fakePrivateKey,
    getPublishTestStreamMessages,
    getWaitForStorage,
    createTestStream
    // getTestSetTimeout,
    // addAfterFn,
} from '../utils'
import { BrubeckClient } from '../../src/BrubeckClient'
import Resend from '../../src/Resends'
// import { Defer } from '../../src/utils'

import clientOptions from './config'
import { Stream } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'

// const { ControlMessage } = ControlLayer

/* eslint-disable no-await-in-loop */

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 20000 : 10000
const MAX_MESSAGES = 5

describeRepeats('resends', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client: BrubeckClient
    let stream: Stream
    let published: any[]
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let waitForStorage: (...args: any[]) => Promise<void>
    let subscriber: Resend
    // const addAfter = addAfterFn()
    // const testSetTimeout = getTestSetTimeout()

    const createClient = (opts: any = {}) => {
        const c = new BrubeckClient({
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
            client.getSessionToken(),
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

        publishTestMessages = getPublishTestStreamMessages(client, stream)

        waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
        })
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    beforeEach(async () => {
        await client.connect()
        expectErrors = 0
        onError = jest.fn()
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
    })

    afterEach(async () => {
        if (client) {
            client.debug('disconnecting after test')
            await client.destroy()
        }
    })

    it('throws error if bad stream id', async () => {
        await expect(async () => {
            await subscriber.resend({
                streamId: 'badstream',
                streamPartition: 0,
                last: 5,
            })
        }).rejects.toThrow('badstream')
    })

    it('throws error if bad partition', async () => {
        await expect(async () => {
            await subscriber.resend({
                streamId: stream.id,
                streamPartition: -1,
                last: 5,
            })
        }).rejects.toThrow('partition')
    })

    describe('no data', () => {
        it('handles nothing to resend', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                streamPartition: 0,
                last: 5,
            })

            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(0)
        })
        /*
        it('resendSubscribe with nothing to resend', async () => {
            emptyStream = await createTestStream(client.client, module)
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
        beforeEach(async () => {
            if (published && published.length) { return }
            // eslint-disable-next-line require-atomic-updates
            published = await publishTestMessages(MAX_MESSAGES, {
                timestamp: 111111,
            })
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        beforeEach(async () => {
            await client.connect()
            // ensure last message is in storage
            await waitForStorage(published[published.length - 1])
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        it.skip('gives zero results for last 0', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                streamPartition: 0,
                last: 0,
            })
            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(0)
        })

        describe('last', () => {
            it('can resend all', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    last: published.length,
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.map((s) => s.toObject()))
            })

            it('can resend subset', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    last: 2,
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.slice(-2).map((s) => s.toObject()))
            })
        })

        /*
        it('closes stream', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                streamPartition: 0,
                last: published.length,
            })

            const received = []
            for await (const m of sub) {
                received.push(m)
            }

            expect(received).toHaveLength(published.length)
        })

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
                const unsubscribeEvents: any[] = []
                client.connection.on(String(ControlMessage.TYPES.UnsubscribeResponse), (m) => {
                    unsubscribeEvents.push(m)
                })
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
                        expect(unsubscribeEvents).toHaveLength(1)
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
