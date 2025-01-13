import 'reflect-metadata'

import { fastPrivateKey } from '@streamr/test-utils'
import { collect, toStreamPartID, until } from '@streamr/utils'
import { Message } from '../../src/Message'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { DEFAULT_PARTITION } from './../../src/StreamIDBuilder'

describe('Group Key Persistence', () => {
    let publisherPrivateKey: string
    let subscriberPrivateKey: string
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let storageNode: FakeStorageNode
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        storageNode = await environment.startStorageNode()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('with encrypted streams', () => {
        let stream: Stream

        async function setupPublisher(opts?: any, streamOpts: any = {}) {
            const client = environment.createClient(opts)
            stream = await createTestStream(client, module, {
                ...streamOpts
            })
            await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
            publishTestMessages = getPublishTestStreamMessages(client, stream)
            return client
        }
        beforeEach(async () => {
            publisherPrivateKey = fastPrivateKey()
            subscriberPrivateKey = fastPrivateKey()

            publisher = await setupPublisher({
                id: 'publisher',
                auth: {
                    privateKey: publisherPrivateKey
                }
            })
            subscriber = environment.createClient({
                id: 'subscriber',
                auth: {
                    privateKey: subscriberPrivateKey
                }
            })
            const otherUser = await subscriber.getUserId()
            await stream.grantPermissions({
                userId: otherUser,
                permissions: [StreamPermission.SUBSCRIBE]
            })
            const groupKey = GroupKey.generate()
            await publisher.updateEncryptionKey({
                streamId: stream.id,
                key: groupKey,
                distributionMethod: 'rotate'
            })
        })

        describe('publisher persists group key, can keep serving group key requests (resend)', () => {
            let published: any[]
            let publisher2: StreamrClient
            beforeEach(async () => {
                // ensure publisher can read a persisted group key
                // 1. publish some messages with publisher
                // 2. then disconnect publisher
                // 3. create new publisher with same key
                // 4. resend messages with subscriber
                // because original publisher is disconnected
                // subscriber will need to ask new publisher
                // for group keys, which the new publisher will have to read from
                // persistence

                published = await publishTestMessages(5, {
                    waitForLast: true
                })

                await publisher.destroy()
                publisher2 = environment.createClient({
                    id: 'publisher2',
                    auth: {
                        privateKey: publisherPrivateKey
                    }
                })
            })

            it('works', async () => {
                await startPublisherKeyExchangeSubscription(publisher2, (await stream.getStreamParts())[0])

                const received: Message[] = []
                const sub = await subscriber.resend(stream.id, {
                    last: published.length
                })

                for await (const m of sub) {
                    received.push(m)
                    if (received.length === published.length) {
                        break
                    }
                }

                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })
        })

        it('subscriber persists group key with realtime', async () => {
            // we want to check that subscriber can read a group key
            // persisted by another subscriber:
            // 1. create publisher and subscriber
            // 2. after subscriber gets first message disconnect subscriber
            // 3. create a new subscriber with same key as original subscriber
            // 5. and subscribe to same stream.
            // this should pick up group key persisted by first subscriber
            const sub = await subscriber.subscribe({
                stream: stream.id
            })

            // this should set up group key
            const published = await publishTestMessages(1)

            const received = await collect(sub, 1)
            await subscriber.destroy()

            const subscriber2 = environment.createClient({
                id: 'subscriber2',
                auth: {
                    privateKey: subscriberPrivateKey
                }
            })

            const sub2 = await subscriber2.subscribe({
                stream: stream.id
            })
            const node2 = subscriber2.getNode()
            await until(async () => {
                return (await node2.getNeighbors(toStreamPartID(stream.id, DEFAULT_PARTITION))).length >= 1
            })

            await Promise.all([collect(sub2, 3), published.push(...(await publishTestMessages(3)))])

            const groupKeyRequests = environment.getNetwork().getSentMessages({
                messageType: StreamMessageType.GROUP_KEY_REQUEST
            })
            expect(groupKeyRequests.length).toBe(1)
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, 1).map((m) => m.signature))
        })

        it('subscriber persists group key with resend last', async () => {
            // we want to check that subscriber can read a group key
            // persisted by another subscriber:
            // 1. create publisher and subscriber
            // 2. after subscriber gets first message
            // 3. disconnect both subscriber and publisher
            // 4. then create a new subscriber with same key as original subscriber
            // 5. and subscribe to same stream.
            // this should pick up group key persisted by first subscriber
            // publisher is disconnected, so can't ask for new group keys
            const sub = await subscriber.subscribe({
                stream: stream.id
            })

            const published = await publishTestMessages(5, {
                waitForLast: true
            })

            const received = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === 1) {
                    break
                }
            }
            await subscriber.destroy()
            await publisher.destroy()

            const subscriber2 = environment.createClient({
                id: 'subscriber2',
                auth: {
                    privateKey: subscriberPrivateKey
                }
            })
            const sub2 = await subscriber2.resend(stream.id, {
                last: 5
            })

            const received2 = []
            for await (const m of sub2) {
                received2.push(m)
                if (received2.length === published.length) {
                    break
                }
            }
            expect(received2.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            expect(received.map((m) => m.signature)).toEqual(published.slice(0, 1).map((m) => m.signature))
        })

        it('can run multiple publishers in parallel', async () => {
            const sub = await subscriber.subscribe({
                stream: stream.id
            })

            // ensure publishers don't clobber each others data
            const publisher2 = environment.createClient({
                id: 'publisher2',
                auth: {
                    privateKey: publisherPrivateKey
                }
            })

            const publishTestMessages2 = getPublishTestStreamMessages(publisher2, stream)
            const MAX_MESSAGES = 16
            const [published1, published2] = await Promise.all([
                publishTestMessages(MAX_MESSAGES - 1),
                publishTestMessages2(MAX_MESSAGES) // use different lengths so we can differentiate who published what
            ])

            const received1 = []
            const received2 = []
            for await (const m of sub) {
                const content = m.content
                // 'n of MAX_MESSAGES' messages belong to publisher2
                if ((content as any).value.endsWith(`of ${MAX_MESSAGES}`)) {
                    received2.push(m)
                } else {
                    received1.push(m)
                }

                if (received1.length === published1.length && received2.length === published2.length) {
                    break
                }
            }

            expect(received1.map((m) => m.signature)).toEqual(published1.map((m) => m.signature))
            expect(received2.map((m) => m.signature)).toEqual(published2.map((m) => m.signature))
        })

        describe('publisher does not complain about group key when many concurrent publishes', () => {
            const NUM_STREAMS = 5
            const streams: Stream[] = []

            beforeEach(async () => {
                publisher = environment.createClient({
                    id: 'publisher',
                    auth: {
                        privateKey: publisherPrivateKey
                    }
                })

                for (let i = 0; i < NUM_STREAMS; i++) {
                    const s = await createTestStream(publisher, module)
                    streams.push(s)
                }
            })

            afterEach(() => publisher.destroy())

            test('works', async () => {
                const tasks = streams.map(async (s) => {
                    const publish = getPublishTestStreamMessages(publisher, s)
                    const published = await Promise.all([publish(5), publish(5), publish(5), publish(5)])
                    return published.flat()
                })
                await Promise.allSettled(tasks)
                const publishedPerStream = await Promise.all(tasks)
                expect(publishedPerStream.map((p) => p.length)).toEqual(Array(NUM_STREAMS).fill(20))
            })
        })

        describe('publisher does not complain about group key when many concurrent publishes with storage', () => {
            const NUM_STREAMS = 5
            const streams: Stream[] = []

            beforeEach(async () => {
                publisher = environment.createClient({
                    id: 'publisher',
                    auth: {
                        privateKey: publisherPrivateKey
                    }
                })

                for (let i = 0; i < NUM_STREAMS; i++) {
                    const s = await createTestStream(publisher, module)
                    await s.addToStorageNode(storageNode.getAddress(), { wait: true })
                    streams.push(s)
                }
            })

            afterEach(() => publisher.destroy())

            test('works', async () => {
                const tasks = streams.map(async (s) => {
                    const publish = getPublishTestStreamMessages(publisher, s)
                    const published = await Promise.all([publish(5), publish(5), publish(5), publish(5)])
                    return published.flat()
                })
                await Promise.allSettled(tasks)
                const publishedPerStream = await Promise.all(tasks)
                expect(publishedPerStream.map((p) => p.length)).toEqual(Array(NUM_STREAMS).fill(20))
            })
        })
    })

    describe('with unencrypted data (public subscribe)', () => {
        const NUM_STREAMS = 5
        const streams: Stream[] = []

        beforeEach(async () => {
            publisher = environment.createClient({
                id: 'publisher',
                auth: {
                    privateKey: publisherPrivateKey
                }
            })
            for (let i = 0; i < NUM_STREAMS; i++) {
                const stream = await createTestStream(publisher, module)
                await stream.grantPermissions({
                    public: true,
                    permissions: [StreamPermission.SUBSCRIBE]
                })
                streams.push(stream)
            }
        })

        afterEach(() => publisher.destroy())

        test('publisher does not complain about group key when many concurrent publishes', async () => {
            const tasks = streams.map(async (stream) => {
                const publish = getPublishTestStreamMessages(publisher, stream)
                const published = await Promise.all([publish(5), publish(5), publish(5), publish(5)])
                return published.flat()
            })

            await Promise.allSettled(tasks)
            const publishedPerStream = await Promise.all(tasks)
            expect(publishedPerStream.map((p) => p.length)).toEqual(Array(NUM_STREAMS).fill(20))
        })
    })
})
