import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import fs from 'fs'
import path from 'path'
import { StreamID, StreamMessage } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamrClientError } from '../../src/StreamrClientError'
import { collect } from '../../src/utils/iterators'
import { getPublishTestStreamMessages, getWaitForStorage, Msg } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'
import { StreamPermission } from './../../src/permission'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from './../test-utils/fake/FakeStorageNode'

const MAX_MESSAGES = 5

describe('Resends2', () => {
    let environment: FakeEnvironment
    let client: StreamrClient
    let publisher: StreamrClient
    let publisherWallet: Wallet
    let stream: Stream
    let storageNode: FakeStorageNode

    const publishTestMessages = (count: number, streamId?: StreamID): Promise<StreamMessage<unknown>[]> => {
        const task = getPublishTestStreamMessages(environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        }), streamId ?? stream.id)
        return task(count)
    }

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
        publisherWallet = fastWallet()
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        storageNode = environment.startStorageNode()
        await stream.addToStorageNode(storageNode.id)
    })

    afterEach(async () => {
        await client?.destroy()
        await publisher?.destroy()
    })

    it('throws if no storage assigned', async () => {
        const notStoredStream = await createTestStream(client, module)
        await expect(async () => {
            await client.resend({
                streamId: notStoredStream.id,
                partition: 0
            }, {
                last: 5
            })
        }).rejects.toThrowStreamError(new StreamrClientError(`no storage assigned: ${notStoredStream.id}`, 'NO_STORAGE_NODES'))
    })

    it('throws error if bad partition', async () => {
        await expect(async () => {
            await client.resend({
                streamId: stream.id,
                partition: -1,
            }, {
                last: 5
            })
        }).rejects.toThrow('streamPartition')
    })

    describe('no historical messages available', () => {

        it('happy path', async () => {
            const sub = await client.resend({
                streamId: stream.id,
                partition: 0,
            }, {
                last: 5,
            })

            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(0)
        })

        describe('resendSubscribe', () => {
            it('happy path', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: 100
                    }
                })

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual([])
                })

                sub.once('resendComplete', onResent)
                const publishedStream2 = await publishTestMessages(3)

                const receivedMsgs: any[] = []
                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === publishedStream2.length) {
                        break
                    }
                }

                expect(receivedMsgs).toHaveLength(publishedStream2.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(publishedStream2.map((m) => m.signature))
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('can ignore errors in resend', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: 100
                    }
                })

                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual([])
                })

                // @ts-expect-error internal method
                const mockFn = jest.spyOn(sub, 'getResent') as any
                const err = new Error('expected')
                mockFn.mockRejectedValueOnce(err)
                sub.once('resendComplete', onResent)

                await publishTestMessages(3)
                await collect(sub, 3)

                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
                expect(onResent).toHaveBeenCalledTimes(1)
            })

            it('can handle errors in resend', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: 100
                    }
                })

                const onResent = jest.fn(() => {})

                // @ts-expect-error internal method
                const mockFn = jest.spyOn(sub, 'getResent') as any
                const err = new Error('expected')
                mockFn.mockRejectedValueOnce(err)
                sub.once('resendComplete', onResent)
                const onSubError = jest.fn()
                sub.on('error', onSubError) // suppress

                const published = await publishTestMessages(3)
                const receivedMsgs = await collect(sub, 3)

                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(onSubError).toHaveBeenCalledTimes(1)
            })

            it('no storage assigned', async () => {
                const nonStoredStream = await createTestStream(client, module)
                await nonStoredStream.grantPermissions({
                    user: publisherWallet.address,
                    permissions: [StreamPermission.PUBLISH]
                })

                const sub = await client.subscribe({
                    streamId: nonStoredStream.id,
                    resend: {
                        last: 100
                    }
                })

                const onError = jest.fn()
                sub.onError.listen(onError)

                const publishedMessages = await publishTestMessages(3, nonStoredStream.id)

                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual([])
                })
                sub.once('resendComplete', onResent)

                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === publishedMessages.length) {
                        break
                    }
                }

                expect(receivedMsgs).toHaveLength(publishedMessages.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(publishedMessages.map((m) => m.signature))
                expect(onError).toHaveBeenCalledTimes(0)
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(environment.getLogger().getEntries()).toContainEqual({
                    message: `no storage assigned: ${nonStoredStream.id}`,
                    level: 'warn'
                })
                expect(await client.getSubscriptions(nonStoredStream.id)).toHaveLength(0)
            })
        })
    })

    describe('historical messages available', () => {
        let published: StreamMessage[]

        beforeEach(async () => {
            published = await publishTestMessages(MAX_MESSAGES)
            // ensure last message is in storage
            await client.waitForStorage(published[published.length - 1])
        })

        it('gives zero results for last 0', async () => {
            const sub = await client.resend({
                streamId: stream.id,
                partition: 0,
            }, {
                last: 0
            })
            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(0)
        })

        describe('last', () => {
            it('can resend all', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0,
                }, {
                    last: published.length
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0
                }, {
                    last: 2
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(-2).map((m) => m.signature))
            })
        })

        describe('from', () => {
            it('can resend all', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0,
                }, {
                    from: {
                        timestamp: published[0].getTimestamp(),
                    }
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0,
                }, {
                    from: {
                        timestamp: published[2].getTimestamp(),
                    }
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(MAX_MESSAGES - 2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(2).map((m) => m.signature))
            })
        })

        describe('range', () => {
            it('can resend all', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0,
                }, {
                    from: {
                        timestamp: published[0].getTimestamp(),
                    },
                    to: {
                        timestamp: published[published.length - 1].getTimestamp(),
                    }
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend({
                    streamId: stream.id,
                    partition: 0,
                }, {
                    from: {
                        timestamp: published[2].getTimestamp(),
                    },
                    to: {
                        timestamp: published[3].getTimestamp(),
                    }
                })

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(2, 4).map((m) => m.signature))
            })
        })

        it('can resend with onMessage callback', async () => {
            const receivedMsgs: any[] = []
            const sub = await client.resend({
                streamId: stream.id,
                partition: 0,
            }, {
                from: {
                    timestamp: published[0].getTimestamp(),
                }
            }, (_msg, streamMessage) => {
                receivedMsgs.push(streamMessage)
            })

            await sub.onFinally.listen()
            expect(receivedMsgs).toHaveLength(published.length)
            expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })

        describe('resendSubscribe', () => {
            it('happy path', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                })
                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)
                const onResent = jest.fn()
                sub.once('resendComplete', onResent)
                const REALTIME_MESSAGES = 2
                setImmediate(async () => {
                    // wrapped with setImmediate so that the request to storage node is fetched
                    // before these messages are stored
                    published.push(...await publishTestMessages(REALTIME_MESSAGES))
                })

                const receivedMsgs = await collect(sub, MAX_MESSAGES + REALTIME_MESSAGES)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('client.subscribe works as regular subscribe when just passing streamId as string', async () => {
                const sub = await client.subscribe(stream.id)
                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                published.push(...await publishTestMessages(2))

                const received = await collect(sub, 2)
                expect(received.map((m) => m.signature)).toEqual(published.slice(-2).map((m) => m.signature))
            })

            it('receives historical messages when no realtime messages available', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length,
                    }
                })

                const publishedBefore = published.slice()
                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual(publishedBefore)
                })

                sub.once('resendComplete', onResent)

                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === published.length) {
                        await sub.return()
                    }
                }

                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('ends resend if unsubscribed', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length,
                    }
                })

                const END_AFTER = 3
                setImmediate(async () => {
                    published.push(...await publishTestMessages(2))
                })
                const receivedMsgs = await sub.forEach(async (_msg, index) => {
                    if (index === END_AFTER - 1) {
                        sub.unsubscribe()
                    }
                }).collect()

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs.map((m) => m.signature)).toEqual(published.slice(0, END_AFTER).map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('can return before start', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                })

                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                await sub.return()
                published.push(...await publishTestMessages(2))
                const received = await collect(sub, published.length)
                expect(received).toHaveLength(0)
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('can end asynchronously', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                })

                const REALTIME_MESSAGES = 2
                setTimeout(async () => {
                    published.push(...await publishTestMessages(REALTIME_MESSAGES))
                })

                let t!: ReturnType<typeof setTimeout>
                const received = []
                try {
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === MAX_MESSAGES + REALTIME_MESSAGES) {
                            t = setTimeout(() => {
                                sub.unsubscribe()
                            })
                        }
                    }
                } finally {
                    clearTimeout(t)
                }

                const msgs = received
                expect(msgs).toHaveLength(published.length)
                expect(msgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('can end inside resend', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                }, )

                setImmediate(async () => {
                    published.push(...await publishTestMessages(2))
                })
                const END_AFTER = 3
                const receivedMsgs: any[] = []
                for await (const msg of sub) {
                    receivedMsgs.push(msg)
                    if (receivedMsgs.length === END_AFTER) {
                        await sub.unsubscribe()
                    }
                }

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs.map((m) => m.signature)).toEqual(published.slice(0, END_AFTER).map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })
        })
    })

    it('decodes resent messages correctly', async () => {
        const publishedMessage = Msg({
            content: fs.readFileSync(path.join(__dirname, '../data/utf8Example.txt'), 'utf8')
        })
        const publishReq = await client.publish(stream, publishedMessage)

        await getWaitForStorage(client)(publishReq)
        const sub = await client.resend(stream.id,
            {
                last: 1
            })
        const messages = await collect(sub)
        expect(messages[0].getParsedContent()).toEqual(publishedMessage)
    })
})
