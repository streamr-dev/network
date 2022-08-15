import { fetchPrivateKeyWithGas, waitForCondition } from 'streamr-test-utils'
import { wait } from '@streamr/utils'

import {
    createTestStream,
    getCreateClient,
    uid,
} from '../test-utils/utils'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { addAfterFn } from '../test-utils/jest-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId } from '../../src/utils/utils'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { StreamMessage } from 'streamr-client-protocol'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'

jest.setTimeout(50000)
// this number should be at least 10, otherwise late subscribers might not join
// in time to see any realtime messages
const MAX_MESSAGES = 10

describe('PubSub with multiple clients', () => {
    let stream: Stream
    let mainClient: StreamrClient
    let otherClient: StreamrClient
    let privateKey: string

    const createClient = getCreateClient()
    const addAfter = addAfterFn()

    beforeEach(async () => {
        privateKey = await fetchPrivateKeyWithGas()
        mainClient = await createClient({
            id: 'main',
            auth: {
                privateKey
            }
        })
        stream = await createTestStream(mainClient, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
    })

    async function createPublisher(opts = {}) {
        const pubClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas(),
            },
            ...opts
        })
        const publisherId = (await pubClient.getAddress()).toLowerCase()

        addAfter(async () => {
            counterId.clear(publisherId) // prevent overflows in counter
        })

        const pubUser = await pubClient.getAddress()
        await mainClient.setPermissions({
            streamId: stream.id,
            assignments: [
                // StreamPermission.SUBSCRIBE needed to check last
                { permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], user: pubUser }
            ]
        })
        await pubClient.connect()
        return pubClient
    }

    async function createSubscriber(opts = {}) {
        const client = await createClient({
            id: 'subscriber',
            auth: {
                privateKey
            },
            ...opts,
        })

        const user = await client.getAddress()

        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user })
        await client.connect()
        return client
    }

    function checkMessages(published: Record<string, StreamMessage[]>, received: Record<string, StreamMessage[]>) {
        for (const [key, msgs] of Object.entries(published)) {
            expect(received[key].map((m) => m.signature)).toEqual(msgs.map((m) => m.signature))
        }
    }

    describe('can get messages published from other client', () => {
        test('it works', async () => {
            otherClient = await createSubscriber()
            await mainClient.connect()

            const receivedMessagesOther: any[] = []
            const receivedMessagesMain: any[] = []
            // subscribe to stream from other client instance
            await otherClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesOther.push(msg)
            })
            // subscribe to stream from main client instance
            await mainClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesMain.push(msg)
            })
            const message = {
                msg: uid('message'),
            }
            // publish message on main client
            await mainClient.publish(stream, message)
            await wait(5000)
            // messages should arrive on both clients?
            expect(receivedMessagesMain).toEqual([message])
            expect(receivedMessagesOther).toEqual([message])
        })
    })

    describe('multiple publishers', () => {
        test('works with multiple publishers on a single stream', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            await mainClient.connect()

            otherClient = await createSubscriber()

            const receivedMessagesOther: Record<string, StreamMessage[]> = {}
            const receivedMessagesMain: Record<string, StreamMessage[]> = {}
            // subscribe to stream from other client instance
            await otherClient.subscribe({
                stream: stream.id,
            }, (_content, streamMessage) => {
                const msgs = receivedMessagesOther[streamMessage.getPublisherId().toLowerCase()] || []
                msgs.push(streamMessage)
                receivedMessagesOther[streamMessage.getPublisherId().toLowerCase()] = msgs
            })

            // subscribe to stream from main client instance
            await mainClient.subscribe({
                stream: stream.id,
            }, (_content, streamMessage) => {
                const msgs = receivedMessagesMain[streamMessage.getPublisherId().toLowerCase()] || []
                msgs.push(streamMessage)
                receivedMessagesMain[streamMessage.getPublisherId().toLowerCase()] = msgs
            })

            /* eslint-disable no-await-in-loop */
            const publishers = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher({
                    id: `publisher-${i}`,
                }))
            }
            /* eslint-enable no-await-in-loop */
            const published: Record<string, StreamMessage[]> = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const publisherId = (await pubClient.getAddress()).toLowerCase()
                addAfter(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })
                const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                    waitForLast: true,
                    waitForLastTimeout: 20000,
                    waitForLastCount: MAX_MESSAGES * publishers.length,
                    createMessage: ({ batchId }) => ({
                        batchId,
                        value: counterId(publisherId),
                    }),
                })
                published[publisherId] = await publishTestMessages(MAX_MESSAGES)
            }))

            await waitForCondition(() => {
                try {
                    checkMessages(published, receivedMessagesMain)
                    checkMessages(published, receivedMessagesOther)
                    return true
                } catch (err) {
                    return false
                }
            }, 35000).catch((err) => {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                throw err
            })

            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        })

        // late subscriber test is super unreliable. Doesn't seem to be a good way to make the
        // late subscriber reliably get all of both realtime and resent messages
        test.skip('works with multiple publishers on one stream with late subscriber (resend)', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            // the otherClient subscribes after the 3rd message hits storage
            otherClient = await createSubscriber()
            await mainClient.connect()

            const receivedMessagesOther: Record<string, StreamMessage[]> = {}
            const receivedMessagesMain: Record<string, StreamMessage[]> = {}

            // subscribe to stream from main client instance
            const mainSub = await mainClient.subscribe({
                stream: stream.id,
            }, (_content, streamMessage) => {
                const key = streamMessage.getPublisherId().toLowerCase()
                const msgs = receivedMessagesMain[key] || []
                msgs.push(streamMessage)
                receivedMessagesMain[key] = msgs
                if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                    mainSub.unsubscribe()
                }
            })

            /* eslint-disable no-await-in-loop */
            const publishers = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher({
                    id: `publisher-${i}`,
                }))
            }

            /* eslint-enable no-await-in-loop */
            let counter = 0
            const published: Record<string, StreamMessage[]> = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const publisherId = (await pubClient.getAddress()).toLowerCase()
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
                        publisherId,
                    }),
                })

                async function addLateSubscriber(lastMessage: StreamMessage) {
                    // late subscribe to stream from other client instance
                    const lateSub = await otherClient.subscribe({
                        stream: stream.id,
                        resend: {
                            from: lastMessage.getMessageRef()
                        }
                    }, (_content, streamMessage) => {
                        const key = streamMessage.getPublisherId().toLowerCase()
                        const msgs = receivedMessagesOther[key] || []
                        msgs.push(streamMessage)
                        receivedMessagesOther[key] = msgs
                    })

                    addAfter(async () => {
                        await lateSub.unsubscribe()
                    })
                }

                let firstMessage: StreamMessage
                const msgs = await publishTestMessages(1, {
                    async afterEach(streamMessage) {
                        firstMessage = streamMessage
                    }
                }) // ensure first message stored
                published[publisherId] = msgs.concat(await publishTestMessages(MAX_MESSAGES - 1, {
                    waitForLast: true,
                    async afterEach() {
                        counter += 1
                        if (counter === 3) {
                            await addLateSubscriber(firstMessage)
                        }
                    }
                }))
            }))

            await waitForCondition(() => {
                try {
                    checkMessages(published, receivedMessagesMain)
                    checkMessages(published, receivedMessagesOther)
                    return true
                } catch (err) {
                    return false
                }
            }, 30000, 300).catch((err) => {
                // convert timeout to actual error
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                throw err
            })
        })
    })

    test('works with multiple publishers on one stream', async () => {
        await mainClient.connect()

        otherClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        await otherClient.connect()

        const receivedMessagesOther: Record<string, StreamMessage[]> = {}
        const receivedMessagesMain: Record<string, StreamMessage[]> = {}
        // subscribe to stream from other client instance
        await otherClient.subscribe({
            stream: stream.id,
        }, (_content, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesOther[key] || []
            msgs.push(streamMessage)
            receivedMessagesOther[key] = msgs
        })

        // subscribe to stream from main client instance
        await mainClient.subscribe({
            stream: stream.id,
        }, (_content, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesMain[key] || []
            msgs.push(streamMessage)
            receivedMessagesMain[key] = msgs
        })

        /* eslint-disable no-await-in-loop */
        const publishers = []
        for (let i = 0; i < 1; i++) {
            publishers.push(await createPublisher())
        }

        /* eslint-enable no-await-in-loop */
        const published: Record<string, StreamMessage[]> = {}
        await Promise.all(publishers.map(async (pubClient) => {
            const publisherId = (await pubClient.getAddress()).toLowerCase()
            const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                waitForLast: true,
                waitForLastTimeout: 35000,
            })

            await publishTestMessages(MAX_MESSAGES, {
                afterEach(msg) {
                    published[publisherId] = published[publisherId] || []
                    published[publisherId].push(msg)
                }
            })
        }))

        await waitForCondition(() => {
            try {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                return true
            } catch (err) {
                return false
            }
        }, 25000).catch(() => {
            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        })
    })

    // late subscriber test is super unreliable. Doesn't seem to be a good way to make the
    // late subscriber reliably get all of both realtime and resent messages
    test.skip('works with multiple publishers on one stream with late subscriber (resend)', async () => {
        const published: Record<string, StreamMessage[]> = {}
        await mainClient.connect()

        otherClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        const otherUser = await otherClient.getAddress()

        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user: otherUser })
        await otherClient.connect()

        const receivedMessagesOther: Record<string, StreamMessage[]> = {}
        const receivedMessagesMain: Record<string, StreamMessage[]> = {}

        // subscribe to stream from main client instance
        const mainSub = await mainClient.subscribe({
            stream: stream.id,
        }, (_content, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesMain[key] || []
            msgs.push(streamMessage)
            receivedMessagesMain[key] = msgs
            if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                mainSub.unsubscribe()
            }
        })

        /* eslint-disable no-await-in-loop */
        const publishers = []
        for (let i = 0; i < 3; i++) {
            publishers.push(await createPublisher())
        }

        let counter = 0
        /* eslint-enable no-await-in-loop */
        await Promise.all(publishers.map(async (pubClient) => {
            const publisherId = (await pubClient.getAddress()).toString().toLowerCase()
            const publishTestMessages = getPublishTestStreamMessages(pubClient, stream, {
                waitForLast: true,
                waitForLastTimeout: 35000,
                waitForLastCount: MAX_MESSAGES * publishers.length,
                delay: 500 + Math.random() * 1000,
            })

            async function addLateSubscriber(lastMessage: StreamMessage) {
                // late subscribe to stream from other client instance
                const lateSub = await otherClient.subscribe({
                    stream: stream.id,
                    resend: {
                        from: lastMessage.getMessageRef()
                    }
                }, (_content, streamMessage) => {
                    const key = streamMessage.getPublisherId().toLowerCase()
                    const msgs = receivedMessagesOther[key] || []
                    msgs.push(streamMessage)
                    receivedMessagesOther[key] = msgs
                })

                addAfter(async () => {
                    await lateSub.unsubscribe()
                })
            }

            let firstMessage: StreamMessage
            const msgs = await publishTestMessages(1, {
                async afterEach(streamMessage) {
                    firstMessage = streamMessage
                }
            }) // ensure first message stored
            published[publisherId] = msgs.concat(await publishTestMessages(MAX_MESSAGES - 1, {
                async afterEach() {
                    counter += 1
                    if (counter === 3) {
                        // late subscribe to stream from other client instance
                        await addLateSubscriber(firstMessage)
                    }
                }
            }))
        }))

        await waitForCondition(() => {
            try {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                return true
            } catch (err) {
                return false
            }
        }, 25000, 300).catch(() => {
            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        })
    })
})
