import { fastPrivateKey } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { StreamMessage } from 'streamr-client-protocol'
import {
    Debug,
    createTestStream,
} from '../test-utils/utils'
import {
    Msg,
    getPublishTestStreamMessages,
    publishTestMessagesGenerator,
} from '../test-utils/publish'
import { Defer } from '../../src/utils/Defer'
import { pLimitFn } from '../../src/utils/promises'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { Subscription } from '../../src/subscribe/Subscription'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { collect } from '../../src/utils/GeneratorUtils'

const debug = Debug('StreamrClient::test')
const TIMEOUT = 15 * 1000
const NUM_MESSAGES = 5

jest.setTimeout(30000)

describe('decryption', () => {
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let expectErrors = 0 // check no errors by default
    let errors: Error[] = []

    let publisher: StreamrClient
    let publisherPrivateKey: string
    let subscriber: StreamrClient
    let subscriberPrivateKey: string
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(() => {
        environment = new FakeEnvironment()
        errors = []
        expectErrors = 0
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
    })

    async function setupClient(opts?: any) {
        const client = environment.createClient(opts)
        await Promise.all([
            client.connect(),
        ])
        return client
    }

    async function setupStream() {
        stream = await createTestStream(publisher, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        publishTestMessages = getPublishTestStreamMessages(publisher, stream)
    }

    async function setupPublisherSubscriberClients(opts?: any) {
        debug('set up clients', opts)
        if (publisher) {
            debug('disconnecting old publisher')
            await publisher.destroy()
        }

        if (subscriber) {
            debug('disconnecting old subscriber')
            await subscriber.destroy()
        }

        publisherPrivateKey = fastPrivateKey()
        subscriberPrivateKey = fastPrivateKey()
        // eslint-disable-next-line require-atomic-updates, semi-style, no-extra-semi
        ;[publisher, subscriber] = await Promise.all([
            setupClient({
                id: 'publisher',
                auth: {
                    privateKey: publisherPrivateKey
                },
                ...opts
            }),
            setupClient({
                id: 'subscriber',
                auth: {
                    privateKey: subscriberPrivateKey
                },
                ...opts
            })
        ])
    }

    // run these in sequence (i.e. pLimitFn(fn, 1)) because core-api can't handle concurrency here
    const grantSubscriberPermissions = pLimitFn(async ({
        stream: s = stream,
        client: c = subscriber,
    }: { stream?: Stream, client?: StreamrClient } = {}) => {
        const p2 = await s.grantPermissions({ user: await c.getAddress(), permissions: [StreamPermission.SUBSCRIBE] })
        return [p2]
    })

    describe('using default config', () => {
        beforeEach(async () => {
            await setupPublisherSubscriberClients()
        })

        beforeEach(async () => {
            await setupStream()
        }, 60000)

        describe('subscriber has permissions', () => {
            beforeEach(async () => {
                await grantSubscriberPermissions()
            })

            it('client.subscribe can get the group key and decrypt encrypted message using an RSA key pair', async () => {
                const msg = Msg()
                const groupKey = GroupKey.generate()
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey,
                    distributionMethod: 'rotate'
                })

                await publisher.publish(stream.id, msg)
                const received = await sub.collect(1)
                expect(received[0].getParsedContent()).toEqual(msg)

                // Check signature stuff
                expect(received[0].signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(received[0].getPublisherId()).toBeTruthy()
                expect(received[0].signature).toBeTruthy()
            }, TIMEOUT * 2)

            it('allows other users to get group key', async () => {
                const msg = Msg()
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const groupKey = GroupKey.generate()
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey,
                    distributionMethod: 'rotate'
                })

                await publisher.publish(stream.id, msg)
                const received = await sub.collect(1)
                expect(received[0].getParsedContent()).toEqual(msg)

                // Check signature stuff
                expect(received[0].signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(received[0].getPublisherId()).toBeTruthy()
                expect(received[0].signature).toBeTruthy()
            }, TIMEOUT * 2)

            it('changing group key injects group key into next stream message', async () => {
                const msgs = [Msg(), Msg(), Msg()]
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                // id | groupKeyId | newGroupKey (encrypted by groupKeyId)
                // msg1 gk2 -
                // msg2 gk2 gk3
                // msg3 gk3 -
                const groupKey1 = GroupKey.generate()
                const groupKey2 = GroupKey.generate()
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey1,
                    distributionMethod: 'rotate'
                })
                await publisher.publish(stream.id, msgs[0])
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey2,
                    distributionMethod: 'rotate'
                })
                await publisher.publish(stream.id, msgs[1])
                await publisher.publish(stream.id, msgs[2])
                const received = await sub.collect(msgs.length)
                received.forEach((streamMessage) => {
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId()).toBeTruthy()
                    expect(streamMessage.signature).toBeTruthy()
                })
                expect(received[0].newGroupKey).toEqual(null)
                expect(received[0].groupKeyId).toEqual(groupKey1.id)
                expect(received[1].newGroupKey).toEqual(groupKey2)
                expect(received[1].groupKeyId).toEqual(groupKey1.id)
                expect(received[2].newGroupKey).toEqual(null)
                expect(received[2].groupKeyId).toEqual(groupKey2.id)
                expect(received.map((m) => m.getParsedContent())).toEqual(msgs)
            }, TIMEOUT * 2)

            it('client.subscribe can get the group key and decrypt multiple encrypted messages using an RSA key pair', async () => {
                // subscribe without knowing publisher the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const groupKey = GroupKey.generate()
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey,
                    distributionMethod: 'rotate'
                })

                const published = await getPublishTestStreamMessages(publisher, stream)(NUM_MESSAGES)

                const received: StreamMessage[] = []
                for await (const msg of sub) {
                    received.push(msg)
                    if (received.length === NUM_MESSAGES) {
                        break
                    }
                }

                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(received).toHaveLength(NUM_MESSAGES)
            }, TIMEOUT * 2)

            it('subscribe with rotating group key', async () => {
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                const published = await getPublishTestStreamMessages(publisher, stream)(NUM_MESSAGES, {
                    afterEach: async () => {
                        await publisher.updateEncryptionKey({
                            streamId: stream.id,
                            distributionMethod: 'rotate'
                        })
                    }
                })

                const received = await sub.collect(published.length)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(received).toHaveLength(NUM_MESSAGES)
            }, TIMEOUT * 2)

            it('can rotate when publisher + subscriber initialised with groupkey', async () => {
                await publisher.destroy()
                await subscriber.destroy()

                const groupKey = GroupKey.generate()
                const groupKeys = {
                    [stream.id]: {
                        [groupKey.id]: {
                            groupKeyId: groupKey.id,
                            groupKeyHex: groupKey.hex,
                        }
                    }
                }
                // eslint-disable-next-line require-atomic-updates
                publisher = await setupClient({
                    auth: {
                        privateKey: publisherPrivateKey
                    },
                    encryptionKeys: groupKeys
                })

                // eslint-disable-next-line require-atomic-updates
                subscriber = await setupClient({
                    auth: {
                        privateKey: subscriberPrivateKey
                    },
                    encryptionKeys: groupKeys
                })

                const publishTask = publishTestMessagesGenerator(publisher, stream, NUM_MESSAGES)
                await publisher.connect()
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })
                const published = await collect(publishTask, NUM_MESSAGES)
                const received = await sub.collect(NUM_MESSAGES)
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            }, TIMEOUT * 2)

            it('client.subscribe with resend last can get the historical keys for previous encrypted messages', async () => {
                // Publish encrypted messages with different keys
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                const published = await publishTestMessages(5, {
                    waitForLast: true,
                    afterEach: async () => {
                        await publisher.updateEncryptionKey({
                            streamId: stream.id,
                            distributionMethod: 'rotate'
                        })
                    }
                })

                await grantSubscriberPermissions()
                // subscribe with resend without knowing the historical keys
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2,
                    },
                }, (_msg: any) => {})

                const received = await sub.collect(2)

                expect(received.map((m) => m.signature)).toEqual(published.slice(-2).map((m) => m.signature))
            }, TIMEOUT * 3)

            describe('error handling', () => {
                let sub: Subscription<any>
                const MAX_MESSAGES_MORE = 10
                const BAD_INDEX = 6

                beforeEach(async () => {
                    const groupKey = GroupKey.generate()

                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        key: groupKey,
                        distributionMethod: 'rotate'
                    })

                    sub = await subscriber.subscribe({
                        stream: stream.id
                    })
                    // @ts-expect-error private
                    const subSession = subscriber.subscriber.getSubscriptionSession(sub.streamPartId)
                    if (!subSession) { throw new Error('no subsession?') }
                    // @ts-expect-error private
                    subSession.pipeline.forEachBefore((streamMessage: StreamMessage, index: number) => {
                        if (index === BAD_INDEX) {
                            // eslint-disable-next-line no-param-reassign
                            streamMessage.groupKeyId = 'badgroupkey'
                        }
                    })
                })

                it('ignores message if onError does not rethrow', async () => {
                    const onSubError = jest.fn()
                    sub.onError.listen(onSubError)
                    // Publish after subscribed
                    const published = await publishTestMessages(MAX_MESSAGES_MORE, {
                        timestamp: 1111111,
                        afterEach: async () => {
                            await publisher.updateEncryptionKey({
                                streamId: stream.id,
                                distributionMethod: 'rotate'
                            })
                        }
                    })

                    const received: StreamMessage[] = []
                    for await (const m of sub) {
                        received.push(m)
                        if (received.length === MAX_MESSAGES_MORE - 1) {
                            break
                        }
                    }

                    expect(received.map((m) => m.signature)).toEqual([
                        ...published.slice(0, BAD_INDEX),
                        ...published.slice(BAD_INDEX + 1, MAX_MESSAGES_MORE)
                    ].map((m) => m.signature))

                    expect(await subscriber.getSubscriptions()).toHaveLength(0)
                    expect(onSubError).toHaveBeenCalledTimes(1)
                })

                it('throws if onError does rethrow', async () => {
                    const onSubError = jest.fn((err) => {
                        sub.debug('ON SUB ERROR', err)
                        throw err
                    })
                    sub.onError.listen(onSubError)
                    // Publish after subscribed
                    const published = await publishTestMessages(MAX_MESSAGES_MORE, {
                        timestamp: 1111111,
                        afterEach: async () => {
                            await publisher.updateEncryptionKey({
                                streamId: stream.id,
                                distributionMethod: 'rotate'
                            })
                        }
                    })

                    const received: StreamMessage[] = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m)
                            if (received.length === MAX_MESSAGES_MORE - 1) {
                                break
                            }
                        }
                    }).rejects.toThrow('decrypt')

                    expect(received.map((m) => m.signature)).toEqual([
                        ...published.slice(0, BAD_INDEX),
                    ].map((m) => m.signature))
                    expect(await subscriber.getSubscriptions()).toHaveLength(0)

                    expect(onSubError).toHaveBeenCalledTimes(1)
                })
            })
        })

        it('errors if rotating group key for no stream', async () => {
            await expect(async () => (
                // @ts-expect-error invalid argument
                publisher.updateEncryptionKey()
            )).rejects.toThrow('streamId')
        })

        it('errors if setting group key for no stream', async () => {
            await expect(async () => {
                await publisher.updateEncryptionKey({
                    // @ts-expect-error invalid argument
                    streamId: undefined,
                    key: GroupKey.generate(),
                    distributionMethod: 'rotate'
                })
            }).rejects.toThrow('streamId')
        })

        it('client.subscribe can not decrypt encrypted messages if does not know the group key', async () => {
            const sub = await subscriber.subscribe({
                stream: stream.id,
            }, (_msg: any) => {})

            await publishTestMessages(3, {
                timestamp: 1111111,
            })

            await expect(async () => {
                await sub.collect(3)
            }).rejects.toThrow()
        })

        it('sets group key per-stream', async () => {
            const stream2 = await createTestStream(publisher, module)

            async function testSub(testStream: Stream, expectedGroupKeyId: string) {
                const done = Defer()
                const received: StreamMessage[] = []
                await grantSubscriberPermissions({ stream: testStream })
                await subscriber.subscribe({
                    streamId: testStream.id,
                }, (_content, msg) => {
                    received.push(msg)
                    if (received.length === NUM_MESSAGES) {
                        done.resolve(undefined)
                    }
                })

                const published = await getPublishTestStreamMessages(publisher, testStream)(NUM_MESSAGES)
                await done
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                expect(received.map((m) => m.groupKeyId)).toSatisfyAll((actualGroupKeyId) => actualGroupKeyId === expectedGroupKeyId)
            }

            const groupKey = GroupKey.generate()
            await publisher.updateEncryptionKey({
                streamId: stream.id,
                key: groupKey,
                distributionMethod: 'rotate'
            })
            const groupKey2 = GroupKey.generate()
            await publisher.updateEncryptionKey({
                streamId: stream2.id,
                key: groupKey2,
                distributionMethod: 'rotate'
            })

            await testSub(stream, groupKey.id)
            await testSub(stream2, groupKey2.id)
        }, TIMEOUT * 2)
    })

    describe('revoking permissions', () => {
        async function testRevokeDuringSubscribe({
            maxMessages = 6,
            revokeAfter = Math.round(maxMessages / 2),
        }: {
            maxMessages?: number
            revokeAfter?: number
        } = {}) {
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

            await publisher.updateEncryptionKey({
                streamId: stream.id,
                distributionMethod: 'rotate'
            })

            await stream.grantPermissions({
                user: await subscriber.getAddress(),
                permissions: [StreamPermission.SUBSCRIBE]
            })

            const sub = await subscriber.subscribe({
                stream: stream.id,
            })

            const errs: Error[] = []
            const onSubError = jest.fn((err: Error) => {
                errs.push(err)
                throw err // this should trigger unsub
            })

            sub.onError.listen(onSubError)

            const received: StreamMessage[] = []
            // Publish after subscribed
            let count = 0
            const gotMessages = Defer()
            // do publish in background otherwise permission is revoked before subscriber starts processing
            const publishTask = publishTestMessages(maxMessages, {
                timestamp: 1111111,
                async afterEach() {
                    count += 1
                    publisher.debug('PUBLISHED %d of %d', count, maxMessages)
                    if (count === revokeAfter) {
                        await gotMessages
                        await stream.revokePermissions({
                            user: await subscriber.getAddress(),
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

            subscriber.debug('\n\n1\n\n')
            let t!: ReturnType<typeof setTimeout>
            const timedOut = jest.fn()
            try {
                await expect(async () => {
                    for await (const m of sub) {
                        received.push(m)
                        subscriber.debug('RECEIVED %d of %d', received.length, maxMessages)
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
                }).rejects.toThrow(/not a subscriber|Could not get GroupKey/)
            } catch (e) {
                debug(e)
            } finally {
                clearTimeout(t)
                // run in finally to ensure publish promise finishes before
                // continuing no matter the result of the expect call above
                const published = await publishTask.catch((err) => {
                    publisher.debug('catch', err)
                    return []
                })

                expect(timedOut).toHaveBeenCalledTimes(0)
                expect(onSubError).toHaveBeenCalledTimes(1)
                expect(received.map((m) => m.signature)).toEqual([
                    ...published.slice(0, revokeAfter),
                ].map((m) => m.signature))
            }
        }
        describe('very low cache maxAge', () => {
            beforeEach(async () => {
                await setupPublisherSubscriberClients({
                    cache: {
                        maxAge: 100,
                    }
                })
            })
            beforeEach(async () => {
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
                        maxAge: 2000,
                    }
                })
            })
            beforeEach(async () => {
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
                        maxAge: 9999999,
                    }
                })
            })

            beforeEach(async () => {
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
})
