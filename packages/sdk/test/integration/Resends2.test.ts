import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { StreamID, collect, toStreamPartID, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { Message, MessageMetadata } from '../../src/Message'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamrClientError } from '../../src/StreamrClientError'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { Msg, getPublishTestStreamMessages, getWaitForStorage } from '../test-utils/publish'
import { createTestStream, readUtf8ExampleIndirectly, startFailingStorageNode } from '../test-utils/utils'

const MAX_MESSAGES = 5

describe('Resends2', () => {
    let environment: FakeEnvironment
    let client: StreamrClient
    let publisher: StreamrClient
    let publisherWallet: Wallet
    let stream: Stream
    let storageNode: FakeStorageNode

    const publishTestMessages = (count: number, streamId?: StreamID): Promise<Message[]> => {
        const task = getPublishTestStreamMessages(publisher, streamId ?? stream.id)
        return task(count)
    }

    beforeAll(() => {
        environment = new FakeEnvironment()
        publisherWallet = fastWallet()
        publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
    })

    afterAll(async () => {
        await environment.destroy()
    })

    beforeEach(async () => {
        stream = await createTestStream(publisher, module)
        await publisher.grantPermissions(stream.id, {
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
        client = environment.createClient()
    })

    afterEach(async () => {
        await client.destroy()
    })

    afterAll(async () => {
        await publisher.destroy()
    })

    it('throws if no storage assigned', async () => {
        await stream.removeFromStorageNode(storageNode.getAddress()) // remove the default storage node added in beforeEach
        await expect(async () => {
            await client.resend(
                {
                    streamId: stream.id,
                    partition: 0
                },
                {
                    last: 5
                }
            )
        }).rejects.toThrowStreamrClientError(
            new StreamrClientError(`no storage assigned: ${stream.id}`, 'NO_STORAGE_NODES')
        )
    })

    it('throws error if bad partition', async () => {
        await expect(async () => {
            await client.resend(
                {
                    streamId: stream.id,
                    partition: -1
                },
                {
                    last: 5
                }
            )
        }).rejects.toThrow('streamPartition')
    })

    describe('no historical messages available', () => {
        it('happy path', async () => {
            const sub = await client.resend(
                {
                    streamId: stream.id,
                    partition: 0
                },
                {
                    last: 5
                }
            )

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

                sub.once('resendCompleted', onResent)
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
                await stream.removeFromStorageNode(storageNode.getAddress()) // remove the default storage node added in beforeEach
                const storageNode2 = await startFailingStorageNode(new Error('expected'), environment)
                await stream.addToStorageNode(storageNode2.getAddress())
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
                sub.once('resendCompleted', onResent)

                await publishTestMessages(3)
                await collect(sub, 3)

                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
                expect(onResent).toHaveBeenCalledTimes(1)
            })

            it('can handle errors in resend', async () => {
                await stream.removeFromStorageNode(storageNode.getAddress()) // remove the default storage node added in beforeEach
                const storageNode2 = await startFailingStorageNode(new Error('expected'), environment)
                await stream.addToStorageNode(storageNode2.getAddress())
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: 100
                    }
                })

                const onResent = jest.fn(() => {})
                sub.once('resendCompleted', onResent)
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
                await stream.removeFromStorageNode(storageNode.getAddress()) // remove the default storage node added in beforeEach
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: 100
                    }
                })

                const onError = jest.fn()
                sub.onError.listen(onError)

                const publishedMessages = await publishTestMessages(3, stream.id)

                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual([])
                })
                sub.once('resendCompleted', onResent)

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
                expect(environment.getLogger().warn).toHaveBeenLastCalledWith(
                    'Skip resend (no storage assigned to stream)',
                    {
                        streamPartId: toStreamPartID(stream.id, 0),
                        resendOptions: {
                            last: 100
                        }
                    }
                )
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })
        })
    })

    describe('historical messages available', () => {
        let published: Message[]

        beforeEach(async () => {
            published = await publishTestMessages(MAX_MESSAGES)
            // ensure last message is in storage
            await client.waitForStorage(published[published.length - 1])
        })

        it('gives zero results for last 0', async () => {
            const sub = await client.resend(
                {
                    streamId: stream.id,
                    partition: 0
                },
                {
                    last: 0
                }
            )
            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(0)
        })

        describe('last', () => {
            it('can resend all', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        last: published.length
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        last: 2
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(-2).map((m) => m.signature))
            })
        })

        describe('from', () => {
            it('can resend all', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        from: {
                            timestamp: published[0].timestamp
                        }
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        from: {
                            timestamp: published[2].timestamp
                        }
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(MAX_MESSAGES - 2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(2).map((m) => m.signature))
            })
        })

        describe('range', () => {
            it('can resend all', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        from: {
                            timestamp: published[0].timestamp
                        },
                        to: {
                            timestamp: published[published.length - 1].timestamp
                        }
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    {
                        from: {
                            timestamp: published[2].timestamp
                        },
                        to: {
                            timestamp: published[3].timestamp
                        }
                    }
                )

                const receivedMsgs = await collect(sub)
                expect(receivedMsgs).toHaveLength(2)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.slice(2, 4).map((m) => m.signature))
            })
        })

        it('can resend with onMessage callback', async () => {
            const receivedMsgs: MessageMetadata[] = []
            const sub = await client.resend(
                {
                    streamId: stream.id,
                    partition: 0
                },
                {
                    from: {
                        timestamp: published[0].timestamp
                    }
                },
                (_msg, metadata) => {
                    receivedMsgs.push(metadata)
                }
            )

            await sub.onFinally.listen()
            expect(receivedMsgs).toHaveLength(published.length)
            expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })

        describe('resendSubscribe', () => {
            it('happy path', async () => {
                const REALTIME_MESSAGES = 2
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                })
                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                const onResent = jest.fn()
                sub.once('resendCompleted', onResent)
                const receivedMsgsPromise = collect(sub, MAX_MESSAGES + REALTIME_MESSAGES)
                await until(() => onResent.mock.calls.length > 0)

                published.push(...(await publishTestMessages(REALTIME_MESSAGES)))

                const receivedMsgs = await receivedMsgsPromise
                expect(receivedMsgs).toHaveLength(published.length)
                expect(onResent).toHaveBeenCalledTimes(1)
                expect(receivedMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
            })

            it('client.subscribe works as regular subscribe when just passing streamId as string', async () => {
                const sub = await client.subscribe(stream.id)
                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                published.push(...(await publishTestMessages(2)))

                const received = await collect(sub, 2)
                expect(received.map((m) => m.signature)).toEqual(published.slice(-2).map((m) => m.signature))
            })

            it('receives historical messages when no realtime messages available', async () => {
                const sub = await client.subscribe({
                    streamId: stream.id,
                    resend: {
                        last: published.length
                    }
                })

                const publishedBefore = published.slice()
                const receivedMsgs: any[] = []

                const onResent = jest.fn(() => {
                    expect(receivedMsgs).toEqual(publishedBefore)
                })

                sub.once('resendCompleted', onResent)

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
        })
    })

    it('decodes resent messages correctly', async () => {
        const content = await readUtf8ExampleIndirectly()
        const publishedMessage = Msg({ content })
        const publishReq = await publisher.publish(stream, publishedMessage)

        await getWaitForStorage(client)(publishReq)
        const sub = await client.resend(stream.id, {
            last: 1
        })
        const messages = await collect(sub)
        expect(messages[0].content).toEqual(publishedMessage)
    })
})
