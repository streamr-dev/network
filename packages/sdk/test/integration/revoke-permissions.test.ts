import 'reflect-metadata'

import { fastPrivateKey } from '@streamr/test-utils'
import { Defer, merge } from '@streamr/utils'
import { Message } from '../../src/Message'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'

// this has publisher & subscriber clients
// publisher begins publishing `maxMessages` messages
// subscriber recieves messages
// after publisher publishes `revokeAfter` messages,
// and subscriber receives the last message
// subscriber has subscribe permission removed
// and publisher rekeys the stream.
// Publisher then keep publishing messages with the new key.
// The subscriber should error on the next message, and unsubscribe
// due to permission change.
// check that subscriber got just the messages from before permission revoked
// and subscriber errored with something about group key or
// permissions
describe('revoke permissions', () => {
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let publisher: StreamrClient
    let publisherPrivateKey: string
    let subscriber: StreamrClient
    let subscriberPrivateKey: string
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(() => {
        environment = new FakeEnvironment()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    async function setupStream() {
        stream = await createTestStream(publisher, module)
        const storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
        publishTestMessages = getPublishTestStreamMessages(publisher, stream)
    }

    async function setupPublisherSubscriberClients(opts?: any) {
        if (publisher) {
            await publisher.destroy()
        }
        if (subscriber) {
            await subscriber.destroy()
        }
        publisherPrivateKey = fastPrivateKey()
        subscriberPrivateKey = fastPrivateKey()
        // eslint-disable-next-line require-atomic-updates
        publisher = environment.createClient(
            merge(
                {
                    id: 'publisher',
                    auth: {
                        privateKey: publisherPrivateKey
                    }
                },
                opts
            )
        )
        // eslint-disable-next-line require-atomic-updates
        subscriber = environment.createClient(
            merge(
                {
                    id: 'subscriber',
                    auth: {
                        privateKey: subscriberPrivateKey
                    },
                    encryption: {
                        keyRequestTimeout: 200
                    }
                },
                opts
            )
        )
    }

    async function testRevokeDuringSubscribe({
        maxMessages = 6,
        revokeAfter = Math.round(maxMessages / 2)
    }: {
        maxMessages?: number
        revokeAfter?: number
    } = {}) {
        await publisher.updateEncryptionKey({
            streamId: stream.id,
            distributionMethod: 'rotate'
        })
        await stream.grantPermissions({
            userId: await subscriber.getUserId(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const sub = await subscriber.subscribe({
            stream: stream.id
        })
        const errs: Error[] = []
        const onSubError = jest.fn((err: Error) => {
            errs.push(err)
            throw err // this should trigger unsub
        })
        sub.onError.listen(onSubError)

        const received: Message[] = []
        // Publish after subscribed
        let count = 0
        const gotMessages = new Defer<undefined>()
        // do publish in background otherwise permission is revoked before subscriber starts processing
        const publishTask = publishTestMessages(maxMessages, {
            timestamp: 1111111,
            async afterEach() {
                count += 1
                if (count === revokeAfter) {
                    await gotMessages
                    await stream.revokePermissions({
                        userId: await subscriber.getUserId(),
                        permissions: [StreamPermission.SUBSCRIBE]
                    })
                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        distributionMethod: 'rekey'
                    })
                }
            }
        })
        publishTask.catch(() => {})

        let t!: ReturnType<typeof setTimeout>
        const timedOut = jest.fn()
        try {
            await expect(async () => {
                for await (const m of sub) {
                    received.push(m)
                    if (received.length === revokeAfter) {
                        gotMessages.resolve(undefined)
                        clearTimeout(t)
                        t = setTimeout(() => {
                            timedOut()
                            sub.unsubscribe().catch(() => {})
                        }, 600000)
                    }

                    if (received.length === maxMessages) {
                        clearTimeout(t)
                        break
                    }
                }
            }).rejects.toThrow(/not a subscriber|Could not get encryption key/)
        } finally {
            clearTimeout(t)
            // run in finally to ensure publish promise finishes before
            // continuing no matter the result of the expect call above
            const published = await publishTask.catch(() => {
                return []
            })

            expect(timedOut).toHaveBeenCalledTimes(0)
            expect(onSubError).toHaveBeenCalledTimes(1)
            expect(received.map((m) => m.signature)).toEqual(
                [...published.slice(0, revokeAfter)].map((m) => m.signature)
            )
        }
    }
    describe('very low cache maxAge', () => {
        beforeEach(async () => {
            await setupPublisherSubscriberClients({
                cache: {
                    maxAge: 100
                }
            })
            await setupStream()
        })
        it('fails gracefully if permission revoked after first message', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 3, revokeAfter: 1 })
        })
        it('fails gracefully if permission revoked after some messages', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 6, revokeAfter: 3 })
        })
    })

    describe('low cache maxAge', () => {
        beforeEach(async () => {
            await setupPublisherSubscriberClients({
                cache: {
                    maxAge: 2000
                }
            })
            await setupStream()
        })
        it('fails gracefully if permission revoked after first message', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 3, revokeAfter: 1 })
        })
        it('fails gracefully if permission revoked after some messages', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 6, revokeAfter: 3 })
        })
    })

    describe('high cache maxAge', () => {
        beforeEach(async () => {
            await setupPublisherSubscriberClients({
                cache: {
                    maxAge: 9999999
                }
            })
            await setupStream()
        })
        it('fails gracefully if permission revoked after first message', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 6, revokeAfter: 1 })
        })
        it('fails gracefully if permission revoked after some messages', async () => {
            await testRevokeDuringSubscribe({ maxMessages: 6, revokeAfter: 3 })
        })
    })
})
