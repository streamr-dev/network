import 'reflect-metadata'

import { toUserId, UserID, until } from '@streamr/utils'
import { Message, MessageMetadata } from '../../src/Message'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId } from '../../src/utils/utils'
import { addAfterFn } from '../test-utils/jest-utils'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream, uid } from '../test-utils/utils'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'

// this number should be at least 10, otherwise late subscribers might not join
// in time to see any realtime messages
const MAX_MESSAGES = 10

const waitMessagesReceived = async (
    received: Record<UserID, MessageMetadata[]>,
    published: Record<UserID, MessageMetadata[]>
) => {
    await until(() => {
        const receivedCount = Object.values(received).flat().length
        const publishedCount = Object.values(published).flat().length
        return receivedCount === publishedCount
    }, 20 * 1000)
}

describe('PubSub with multiple clients', () => {
    let stream: Stream
    let mainClient: StreamrClient
    let otherClient: StreamrClient
    let environment: FakeEnvironment
    const addAfter = addAfterFn()

    beforeEach(async () => {
        environment = new FakeEnvironment()
        mainClient = environment.createClient({
            id: 'subscriber-main'
        })
        stream = await createTestStream(mainClient, module)
        const storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
    }, 30 * 1000)

    afterEach(async () => {
        await environment.destroy()
    })

    async function createPublisher(id: number) {
        const pubClient = environment.createClient({
            id: `publisher${id}`
        })
        const publisherId = await pubClient.getUserId()

        addAfter(async () => {
            counterId.clear(toUserId(publisherId)) // prevent overflows in counter
        })

        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            userId: publisherId
        })
        return pubClient
    }

    async function createSubscriber() {
        const client = environment.createClient({
            id: 'subscriber-other'
        })
        const userId = await client.getUserId()
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], userId })
        return client
    }

    function checkMessages(published: Record<UserID, Message[]>, received: Record<UserID, MessageMetadata[]>) {
        for (const [key, msgs] of Object.entries(published)) {
            expect(received[key as UserID].map((m) => m.signature)).toEqual(msgs.map((m) => m.signature))
        }
    }

    describe('can get messages published from other client', () => {
        test(
            'it works',
            async () => {
                otherClient = await createSubscriber()

                const receivedMessagesOther: any[] = []
                const receivedMessagesMain: any[] = []
                // subscribe to stream from other client instance
                await otherClient.subscribe(
                    {
                        stream: stream.id
                    },
                    (msg) => {
                        receivedMessagesOther.push(msg)
                    }
                )
                // subscribe to stream from main client instance
                await mainClient.subscribe(
                    {
                        stream: stream.id
                    },
                    (msg) => {
                        receivedMessagesMain.push(msg)
                    }
                )
                const message = {
                    msg: uid('message')
                }
                // publish message on main client
                await mainClient.publish(stream, message)
                await until(() => receivedMessagesMain.length === 1 && receivedMessagesOther.length === 1, 15 * 1000)
                // messages should arrive on both clients?
                expect(receivedMessagesMain).toEqual([message])
                expect(receivedMessagesOther).toEqual([message])
            },
            30 * 1000
        )
    })

    describe('multiple publishers', () => {
        // TODO: flaky test fix in NET-1022
        test.skip(
            'works with multiple publishers on a single stream',
            async () => {
                // this creates two subscriber clients and multiple publisher clients
                // all subscribing and publishing to same stream

                otherClient = await createSubscriber()

                const receivedMessagesOther: Record<UserID, MessageMetadata[]> = {}
                const receivedMessagesMain: Record<UserID, MessageMetadata[]> = {}
                // subscribe to stream from other client instance
                await otherClient.subscribe(
                    {
                        stream: stream.id
                    },
                    (_content, metadata) => {
                        const publisherId = toUserId(metadata.publisherId)
                        const msgs = receivedMessagesOther[publisherId] || []
                        msgs.push(metadata)
                        receivedMessagesOther[publisherId] = msgs
                    }
                )

                // subscribe to stream from main client instance
                await mainClient.subscribe(
                    {
                        stream: stream.id
                    },
                    (_content, metadata) => {
                        const publisherId = toUserId(metadata.publisherId)
                        const msgs = receivedMessagesMain[publisherId] || []
                        msgs.push(metadata)
                        receivedMessagesMain[publisherId] = msgs
                    }
                )

                const publishers: StreamrClient[] = []
                for (let i = 0; i < 3; i++) {
                    publishers.push(await createPublisher(i))
                }
                const published: Record<UserID, Message[]> = {}
                await Promise.all(
                    publishers.map(async (pubClient) => {
                        const publisherId = toUserId(await pubClient.getUserId())
                        addAfter(() => {
                            counterId.clear(publisherId) // prevent overflows in counter
                        })
                        const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                            createMessage: ({ batchId }) => ({
                                batchId,
                                value: counterId(publisherId)
                            })
                        })
                        published[publisherId] = await publishTestMessages(MAX_MESSAGES)
                    })
                )

                await waitMessagesReceived(receivedMessagesMain, published)
                await waitMessagesReceived(receivedMessagesOther, published)

                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
            },
            30 * 1000
        )

        // late subscriber test is super unreliable. Doesn't seem to be a good way to make the
        // late subscriber reliably get all of both realtime and resent messages
        test.skip('works with multiple publishers on one stream with late subscriber (resend)', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            // the otherClient subscribes after the 3rd message hits storage
            otherClient = await createSubscriber()

            const receivedMessagesOther: Record<UserID, MessageMetadata[]> = {}
            const receivedMessagesMain: Record<UserID, MessageMetadata[]> = {}

            // subscribe to stream from main client instance
            const mainSub = await mainClient.subscribe(
                {
                    stream: stream.id
                },
                (_content, metadata) => {
                    const publisherId = toUserId(metadata.publisherId)
                    const msgs = receivedMessagesMain[publisherId] || []
                    msgs.push(metadata)
                    receivedMessagesMain[publisherId] = msgs
                    if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                        mainSub.unsubscribe()
                    }
                }
            )

            const publishers: StreamrClient[] = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher(i))
            }

            let counter = 0
            const published: Record<string, Message[]> = {}
            await Promise.all(
                publishers.map(async (pubClient) => {
                    const publisherId = toUserId(await pubClient.getUserId())
                    addAfter(() => {
                        counterId.clear(publisherId) // prevent overflows in counter
                    })

                    const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                        waitForLast: true,
                        waitForLastTimeout: 35000,
                        waitForLastCount: MAX_MESSAGES * publishers.length,
                        delay: 500 + Math.random() * 1000,
                        createMessage: (msg) => ({
                            ...msg,
                            publisherId
                        })
                    })

                    async function addLateSubscriber(lastMessage: Message) {
                        // late subscribe to stream from other client instance
                        const lateSub = await otherClient.subscribe(
                            {
                                stream: stream.id,
                                resend: {
                                    from: lastMessage.streamMessage.getMessageRef()
                                }
                            },
                            (_content, metadata) => {
                                const publisherId = toUserId(metadata.publisherId)
                                const msgs = receivedMessagesOther[publisherId] || []
                                msgs.push(metadata)
                                receivedMessagesOther[publisherId] = msgs
                            }
                        )

                        addAfter(async () => {
                            await lateSub.unsubscribe()
                        })
                    }

                    let firstMessage: Message
                    const msgs = await publishTestMessages(1, {
                        async afterEach(streamMessage) {
                            firstMessage = streamMessage
                        }
                    }) // ensure first message stored
                    published[publisherId] = msgs.concat(
                        await publishTestMessages(MAX_MESSAGES - 1, {
                            waitForLast: true,
                            async afterEach() {
                                counter += 1
                                if (counter === 3) {
                                    await addLateSubscriber(firstMessage)
                                }
                            }
                        })
                    )
                })
            )

            await waitMessagesReceived(receivedMessagesMain, published)
            await waitMessagesReceived(receivedMessagesOther, published)

            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)

            await otherClient.destroy()
            await Promise.all(publishers.map((p) => p.destroy()))
        })
    })

    test(
        'works with multiple publishers on one stream',
        async () => {
            otherClient = await createSubscriber()
            await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

            const receivedMessagesOther: Record<UserID, MessageMetadata[]> = {}
            const receivedMessagesMain: Record<UserID, MessageMetadata[]> = {}
            // subscribe to stream from other client instance
            await otherClient.subscribe(
                {
                    stream: stream.id
                },
                (_content, metadata) => {
                    const publisherId = toUserId(metadata.publisherId)
                    const msgs = receivedMessagesOther[publisherId] || []
                    msgs.push(metadata)
                    receivedMessagesOther[publisherId] = msgs
                }
            )

            // subscribe to stream from main client instance
            await mainClient.subscribe(
                {
                    stream: stream.id
                },
                (_content, metadata) => {
                    const publisherId = toUserId(metadata.publisherId)
                    const msgs = receivedMessagesMain[publisherId] || []
                    msgs.push(metadata)
                    receivedMessagesMain[publisherId] = msgs
                }
            )

            const publishers: StreamrClient[] = []
            for (let i = 0; i < 1; i++) {
                publishers.push(await createPublisher(i))
            }

            const published: Record<UserID, Message[]> = {}
            await Promise.all(
                publishers.map(async (pubClient) => {
                    const publisherId = toUserId(await pubClient.getUserId())
                    const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                        waitForLast: true,
                        waitForLastTimeout: 35000
                    })
                    await publishTestMessages(MAX_MESSAGES, {
                        afterEach(msg) {
                            published[publisherId] = published[publisherId] || []
                            published[publisherId].push(msg)
                        }
                    })
                })
            )

            await waitMessagesReceived(receivedMessagesMain, published)
            await waitMessagesReceived(receivedMessagesOther, published)

            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)

            await Promise.all(publishers.map((p) => p.destroy()))
        },
        30 * 1000
    )

    // late subscriber test is super unreliable. Doesn't seem to be a good way to make the
    // late subscriber reliably get all of both realtime and resent messages
    test.skip('works with multiple publishers on one stream with late subscriber (resend)', async () => {
        const published: Record<string, Message[]> = {}

        otherClient = environment.createClient()
        const otherUser = await otherClient.getUserId()

        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], userId: otherUser })

        const receivedMessagesOther: Record<UserID, MessageMetadata[]> = {}
        const receivedMessagesMain: Record<UserID, MessageMetadata[]> = {}

        // subscribe to stream from main client instance
        const mainSub = await mainClient.subscribe(
            {
                stream: stream.id
            },
            (_content, metadata) => {
                const publisherId = toUserId(metadata.publisherId)
                const msgs = receivedMessagesMain[publisherId] || []
                msgs.push(metadata)
                receivedMessagesMain[publisherId] = msgs
                if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                    mainSub.unsubscribe()
                }
            }
        )

        const publishers: StreamrClient[] = []
        for (let i = 0; i < 3; i++) {
            publishers.push(await createPublisher(i))
        }

        let counter = 0
        await Promise.all(
            publishers.map(async (pubClient) => {
                const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                    waitForLast: true,
                    waitForLastTimeout: 35000,
                    waitForLastCount: MAX_MESSAGES * publishers.length,
                    delay: 500 + Math.random() * 1000
                })

                async function addLateSubscriber(lastMessage: Message) {
                    // late subscribe to stream from other client instance
                    const lateSub = await otherClient.subscribe(
                        {
                            stream: stream.id,
                            resend: {
                                from: lastMessage.streamMessage.getMessageRef()
                            }
                        },
                        (_content, metadata) => {
                            const publisherId = toUserId(metadata.publisherId)
                            const msgs = receivedMessagesOther[publisherId] || []
                            msgs.push(metadata)
                            receivedMessagesOther[publisherId] = msgs
                        }
                    )

                    addAfter(async () => {
                        await lateSub.unsubscribe()
                    })
                }

                let firstMessage: Message
                const msgs = await publishTestMessages(1, {
                    async afterEach(streamMessage) {
                        firstMessage = streamMessage
                    }
                }) // ensure first message stored
                const publisherId = toUserId(await pubClient.getUserId())
                published[publisherId] = msgs.concat(
                    await publishTestMessages(MAX_MESSAGES - 1, {
                        async afterEach() {
                            counter += 1
                            if (counter === 3) {
                                // late subscribe to stream from other client instance
                                await addLateSubscriber(firstMessage)
                            }
                        }
                    })
                )
            })
        )

        await waitMessagesReceived(receivedMessagesMain, published)
        await waitMessagesReceived(receivedMessagesOther, published)

        checkMessages(published, receivedMessagesMain)
        checkMessages(published, receivedMessagesOther)

        await Promise.all(publishers.map((p) => p.destroy()))
    })
})
