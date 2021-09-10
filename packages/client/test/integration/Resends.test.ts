import { wait } from 'streamr-test-utils'
import { StreamMessage } from 'streamr-client-protocol'

import {
    clientOptions,
    describeRepeats,
    getPublishTestStreamMessages,
    getWaitForStorage,
    createTestStream
} from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import Resend from '../../src/Resends'
import { StorageNode } from '../../src/StorageNode'

import { Stream } from '../../src/Stream'

/* eslint-disable no-await-in-loop */

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 20000 : 10000
const MAX_MESSAGES = 5

describeRepeats('resends', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client: StreamrClient
    let stream: Stream
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let waitForStorage: (...args: any[]) => Promise<void>
    let subscriber: Resend

    beforeAll(async () => {
        client = new StreamrClient(clientOptions)
        subscriber = client.resends

        // eslint-disable-next-line require-atomic-updates
        client.debug('connecting before all tests >>')
        await Promise.all([
            client.connect(),
            client.getSessionToken(),
        ])
        client.debug('connecting before all tests <<')
    })

    beforeAll(async () => {
        client.debug('createStream >>')
        stream = await createTestStream(client, module)
        client.debug('createStream <<')
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

    afterAll(async () => {
        if (client) {
            await client.destroy()
        }
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
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

    it('throws if no storage assigned', async () => {
        const notStoredStream = await createTestStream(client, module)
        await expect(async () => {
            await subscriber.resend({
                streamId: notStoredStream.id,
                streamPartition: 0,
                last: 5,
            })
        }).rejects.toThrow('storage')
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
        let published: StreamMessage[]
        beforeEach(async () => {
            if (published && published.length) { return }
            // eslint-disable-next-line require-atomic-updates
            published = await publishTestMessages(MAX_MESSAGES)
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        beforeEach(async () => {
            await client.connect()
            // ensure last message is in storage
            await waitForStorage(published[published.length - 1])
        }, WAIT_FOR_STORAGE_TIMEOUT * 2)

        it('gives zero results for last 0', async () => {
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

        describe('from', () => {
            it('can resend all', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    resend: {
                        from: {
                            timestamp: published[0].getTimestamp(),
                        },
                    }
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.map((s) => s.toObject()))
            })

            it('can resend subset', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    from: {
                        timestamp: published[2].getTimestamp(),
                    },
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(MAX_MESSAGES - 2)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.slice(2).map((s) => s.toObject()))
            })
        })

        describe('range', () => {
            it('can resend all', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    resend: {
                        from: {
                            timestamp: published[0].getTimestamp(),
                        },
                        to: {
                            timestamp: published[published.length - 1].getTimestamp(),
                        },
                    }
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.map((s) => s.toObject()))
            })

            it('can resend subset', async () => {
                const sub = await subscriber.resend({
                    streamId: stream.id,
                    streamPartition: 0,
                    from: {
                        timestamp: published[2].getTimestamp(),
                    },
                    to: {
                        timestamp: published[3].getTimestamp(),
                    },
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.slice(2, 4).map((s) => s.toObject()))
            })
        })

        it('can resend with onMessage callback', async () => {
            const receivedMsgs: any[] = []
            const sub = await subscriber.resend({
                streamId: stream.id,
                streamPartition: 0,
                resend: {
                    from: {
                        timestamp: published[0].getTimestamp(),
                    },
                }
            }, (_msg, streamMessage) => {
                receivedMsgs.push(streamMessage)
            })

            await sub.onFinally()
            expect(receivedMsgs).toHaveLength(published.length)
            expect(receivedMsgs.map((s) => s.toObject())).toEqual(published.map((s) => s.toObject()))
        })

        describe('resendSubscribe', () => {
            it('sees resends and realtime', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })
                expect(client.count(stream.id)).toBe(1)

                const onResent = jest.fn()
                sub.onResent(onResent)

                // eslint-disable-next-line no-await-in-loop
                published.push(...await publishTestMessages(2))

                const receivedMsgs = await sub.collect(published.length)

                expect(receivedMsgs).toHaveLength(published.length)
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(receivedMsgs).toEqual(published)
                expect(client.count(stream.id)).toBe(0)
            })

            it('client.subscribe works as regular subscribe when just passing streamId as string', async () => {
                const sub = await client.subscribe(stream.id)
                expect(client.count(stream.id)).toBe(1)

                published.push(...await publishTestMessages(2))

                const received = await sub.collect(2)
                expect(received).toEqual(published.slice(-2))
            })

            it('sees resends when no realtime', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const publishedBefore = published.slice()
                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual(publishedBefore)
                })

                sub.onResent(onResent)

                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === published.length) {
                        await sub.return()
                    }
                }

                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs).toEqual(published)
                expect(client.count(stream.id)).toBe(0)
            })

            it('ends resend if unsubscribed', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const END_AFTER = 3
                // eslint-disable-next-line no-await-in-loop
                published.push(...await publishTestMessages(2))
                const receivedMsgs = await sub.forEach(async (_msg, index) => {
                    if (index === END_AFTER - 1) {
                        sub.unsubscribe()
                    }
                }).collect()

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs).toEqual(published.slice(0, END_AFTER))
                expect(client.count(stream.id)).toBe(0)
            })

            it('can return before start', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                expect(client.count(stream.id)).toBe(1)

                await sub.return()
                published.push(...await publishTestMessages(2))
                const received = await sub.collect(published.length)
                expect(received).toHaveLength(0)
                expect(client.count(stream.id)).toBe(0)
            })

            it('can end asynchronously', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                published.push(...await publishTestMessages(2))

                let t!: ReturnType<typeof setTimeout>
                const received = []
                try {
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === published.length) {
                            t = setTimeout(() => {
                                sub.cancel()
                            })
                        }
                    }
                } finally {
                    clearTimeout(t)
                }

                const msgs = received
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(client.count(stream.id)).toBe(0)
            })

            it('can end inside resend', async () => {
                const sub = await client.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                published.push(...await publishTestMessages(2))
                const END_AFTER = 3
                const receivedMsgs: any[] = []
                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === END_AFTER) {
                        await sub.cancel()
                    }
                }

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs).toEqual(published.slice(0, END_AFTER))
                expect(client.count(stream.id)).toBe(0)
            })
        })
    })
})
