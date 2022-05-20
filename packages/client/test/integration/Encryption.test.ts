import { fastPrivateKey, wait } from 'streamr-test-utils'
import { StreamMessage } from 'streamr-client-protocol'
import {
    Msg,
    Debug,
    getPublishTestStreamMessages,
    publishTestMessagesGenerator,
    createTestStream,
} from '../test-utils/utils'
import { Defer, pLimitFn } from '../../src/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { Subscription } from '../../src/subscribe/Subscription'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { ClientFactory, createClientFactory } from '../test-utils/fake/fakeEnvironment'

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
    let clientFactory: ClientFactory

    function checkEncryptionMessages(testClient: StreamrClient) {
        const onSendTest = Defer()
        // @ts-expect-error private
        testClient.publisher.publishQueue.forEach(onSendTest.wrapError(async ([streamMessage]) => {
            // check encryption is as expected
            if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
            } else if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE) {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.RSA)
            } else {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
            }
        })).onFinally(() => {
            onSendTest.resolve(undefined)
        })

        return onSendTest
    }

    beforeEach(() => {
        clientFactory = createClientFactory()
        errors = []
        expectErrors = 0
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
    })

    async function setupClient(opts?: any) {
        const client = clientFactory.createClient(opts)
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

            it('client.subscribe can decrypt encrypted messages if it knows the group key', async () => {
                const groupKey = GroupKey.generate()
                const keys = {
                    [stream.id]: {
                        [groupKey.id]: groupKey,
                    }
                }
                const msg = Msg()
                const done = Defer()
                await subscriber.subscribe({
                    stream: stream.id,
                    // @ts-expect-error private
                    groupKeys: keys,
                }, done.wrap((parsedContent, streamMessage) => {
                    expect(parsedContent).toEqual(msg)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId())
                    expect(streamMessage.signature)
                }))

                // publisher.once('error', done.reject)
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    key: groupKey,
                    distributionMethod: 'rotate'
                })
                // Publish after subscribed
                await Promise.all([
                    publisher.publish(stream.id, msg),
                    done,
                ])
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
                const onEncryptionMessageErr = checkEncryptionMessages(publisher)

                await publisher.publish(stream.id, msg)
                const received = await sub.collect(1)
                expect(received[0].getParsedContent()).toEqual(msg)

                // Check signature stuff
                expect(received[0].signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(received[0].getPublisherId()).toBeTruthy()
                expect(received[0].signature).toBeTruthy()
                onEncryptionMessageErr.resolve(undefined)
                await onEncryptionMessageErr
            }, TIMEOUT * 2)

            it('allows other users to get group key', async () => {
                const onEncryptionMessageErr = checkEncryptionMessages(publisher)
                const onEncryptionMessageErr2 = checkEncryptionMessages(subscriber)
                const msg = Msg()
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })
                // sub.once('error', done.reject)

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
                onEncryptionMessageErr.resolve(undefined)
                await onEncryptionMessageErr
                onEncryptionMessageErr2.resolve(undefined)
                await onEncryptionMessageErr2
            }, TIMEOUT * 2)

            it('changing group key injects group key into next stream message', async () => {
                const msgs = [Msg(), Msg(), Msg()]
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const onEncryptionMessageErr = checkEncryptionMessages(publisher)
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
                onEncryptionMessageErr.resolve(undefined)
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
                await onEncryptionMessageErr
            }, TIMEOUT * 2)

            it('does not encrypt messages for public streams', async () => {
                const stream2 = await createTestStream(publisher, module)
                await stream2.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

                let didFindStream2 = false

                function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                    const onSendTest = Defer()
                    // @ts-expect-error private
                    testClient.publisher.publishQueue.forEach(onSendTest.wrapError(async ([streamMessage]) => {
                        // check encryption is as expected
                        if (streamMessage.getStreamId() === stream2.id) {
                            didFindStream2 = true
                            // stream2 always unencrypted
                            expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
                            return
                        }

                        if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
                            expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
                        } else if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE) {
                            expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.RSA)
                        } else {
                            expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
                        }
                    })).onFinally(() => {
                        onSendTest.resolve(undefined)
                    })

                    return onSendTest
                }

                async function testSub(testStream: Stream) {
                    const done = Defer()
                    const received: any = []
                    await grantSubscriberPermissions({ stream: testStream })
                    await subscriber.subscribe({
                        stream: testStream.id,
                    }, (parsedContent) => {
                        received.push(parsedContent)
                        if (received.length === NUM_MESSAGES) {
                            done.resolve(undefined)
                        }
                    })

                    const published: any[] = []
                    // @ts-expect-error private
                    publisher.publisher.streamMessageQueue.onMessage(async ([streamMessage]) => {
                        if (streamMessage.getStreamId() !== testStream.id) { return }
                        published.push(streamMessage.getParsedContent())
                    })
                    await getPublishTestStreamMessages(publisher, testStream)(NUM_MESSAGES)

                    await done

                    expect(received).toEqual(published)
                }

                const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

                await testSub(stream)
                await testSub(stream2)
                // const tasks = [
                //    testSub(stream),
                //    testSub(stream2)
                // ]
                // await Promise.allSettled(tasks)
                // await Promise.all(tasks)
                onEncryptionMessageErr.resolve(undefined)
                await onEncryptionMessageErr
                expect(didFindStream2).toBeTruthy()
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

                const published: any[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.onMessage(async ([streamMessage]) => {
                    if (streamMessage.getStreamId() !== stream.id) { return }
                    published.push(streamMessage.getParsedContent())
                })
                await getPublishTestStreamMessages(publisher, stream)(NUM_MESSAGES)

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === NUM_MESSAGES) {
                        break
                    }
                }

                expect(received).toEqual(published)
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
                const publishedStreamMessages: any[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.onMessage(async ([streamMessage]) => {
                    if (streamMessage.getStreamId() !== stream.id) { return }
                    publishedStreamMessages.push(streamMessage.clone())
                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        distributionMethod: 'rotate'
                    })
                })
                const published = await getPublishTestStreamMessages(publisher, stream)(NUM_MESSAGES)

                const received = await sub.collect(published.length)
                expect(received.map((s) => s.getParsedContent())).toEqual(publishedStreamMessages.map((s) => s.getParsedContent()))
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

                const contentClear: any[] = []
                const streamMessagesPublished: StreamMessage<any>[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.forEach(([streamMessage]) => {
                    if (streamMessage.getStreamId() !== stream.id) { return }
                    contentClear.push(streamMessage.getParsedContent())
                })
                // @ts-expect-error private
                publisher.publisher.publishQueue.forEach(([streamMessage]) => {
                    if (streamMessage.getStreamId() !== stream.id) { return }
                    streamMessagesPublished.push(streamMessage)
                })

                const publishStream = publishTestMessagesGenerator(publisher, stream, NUM_MESSAGES)
                await publisher.connect()
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                const sub = (await subscriber.subscribe({
                    stream: stream.id,
                }))
                await publishStream.collect(NUM_MESSAGES)

                // published with encryption
                expect(streamMessagesPublished.map((streamMessage) => streamMessage.encryptionType))
                    .toEqual(streamMessagesPublished.map(() => StreamMessage.ENCRYPTION_TYPES.AES))

                const received = await sub.collect(NUM_MESSAGES)

                expect(received.map((s) => s.getParsedContent())).toEqual(contentClear)
            }, TIMEOUT * 2)

            it('client.resend last can get the historical keys for previous encrypted messages', async () => {
                // Publish encrypted messages with different keys
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.forEach(async () => {
                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        distributionMethod: 'rotate'
                    })
                })
                const published: any[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.forEach(([streamMessage]) => {
                    if (streamMessage.getStreamId() !== stream.id) { return }
                    published.push(streamMessage.getParsedContent())
                })
                await publishTestMessages(NUM_MESSAGES, {
                    waitForLast: true,
                })

                // resend without knowing the historical keys
                await grantSubscriberPermissions()
                const sub = await subscriber.resend(
                    stream.id,
                    {
                        last: 2,
                    }
                )

                const received = await sub.collect()

                expect(received.map((s) => s.getParsedContent())).toEqual(published.slice(-2))
            }, TIMEOUT * 2)

            it('client.subscribe with resend last can get the historical keys for previous encrypted messages', async () => {
                // Publish encrypted messages with different keys
                await publisher.updateEncryptionKey({
                    streamId: stream.id,
                    distributionMethod: 'rotate'
                })
                // @ts-expect-error private
                publisher.publisher.publishQueue.forEach(async () => {
                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        distributionMethod: 'rotate'
                    })
                })
                const published = await publishTestMessages(5, {
                    waitForLast: true,
                })

                await grantSubscriberPermissions()
                // subscribe with resend without knowing the historical keys
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2,
                    },
                }, (_msg: any) => {})

                const received = await sub.collectContent(2)

                expect(received).toEqual(published.slice(-2).map((s) => s.getParsedContent()))
            }, TIMEOUT * 3)

            describe('error handling', () => {
                let sub: Subscription<any>
                const MAX_MESSAGES_MORE = 10
                const BAD_INDEX = 6
                let contentClear: any[] = []

                beforeEach(async () => {
                    const groupKey = GroupKey.generate()
                    const keys = {
                        [stream.id]: {
                            [groupKey.id]: groupKey,
                        }
                    }

                    await publisher.updateEncryptionKey({
                        streamId: stream.id,
                        key: groupKey,
                        distributionMethod: 'rotate'
                    })
                    contentClear = []

                    // @ts-expect-error private
                    publisher.publisher.streamMessageQueue.forEach(([streamMessage]) => {
                        if (streamMessage.getStreamId() !== stream.id) { return }
                        contentClear.push(streamMessage.getParsedContent())
                    })

                    // @ts-expect-error private
                    publisher.publisher.publishQueue.forEach(async () => {
                        await publisher.updateEncryptionKey({
                            streamId: stream.id,
                            distributionMethod: 'rotate'
                        })
                    })

                    sub = await subscriber.subscribe({
                        stream: stream.id,
                        // @ts-expect-error TODO invalid parameter
                        groupKeys: keys,
                    })
                    // @ts-expect-error private
                    const subSession = subscriber.subscriber.getSubscriptionSession(sub.streamPartId)
                    if (!subSession) { throw new Error('no subsession?') }
                    subSession.pipeline.forEachBefore((streamMessage: StreamMessage, index: number) => {
                        if (index === BAD_INDEX) {
                            // eslint-disable-next-line no-param-reassign
                            streamMessage.groupKeyId = 'badgroupkey'
                        }
                    })
                })

                it('ignores message if onError does not rethrow', async () => {
                    const onSubError = jest.fn()
                    sub.onError(onSubError)
                    // Publish after subscribed
                    await publishTestMessages(MAX_MESSAGES_MORE, {
                        timestamp: 1111111,
                    })

                    const received: any[] = []
                    for await (const m of sub) {
                        received.push(m.getParsedContent())
                        if (received.length === MAX_MESSAGES_MORE - 1) {
                            break
                        }
                    }

                    expect(received).toEqual([
                        ...contentClear.slice(0, BAD_INDEX),
                        ...contentClear.slice(BAD_INDEX + 1, MAX_MESSAGES_MORE)
                    ])

                    expect(await subscriber.getSubscriptions()).toHaveLength(0)
                    expect(onSubError).toHaveBeenCalledTimes(1)
                })

                it('throws if onError does rethrow', async () => {
                    const onSubError = jest.fn((err) => {
                        sub.debug('ON SUB ERROR', err)
                        throw err
                    })
                    sub.onError(onSubError)
                    // Publish after subscribed
                    await publishTestMessages(MAX_MESSAGES_MORE, {
                        timestamp: 1111111,
                    })

                    const received: any[] = []
                    await expect(async () => {
                        for await (const m of sub) {
                            received.push(m.getParsedContent())
                            if (received.length === MAX_MESSAGES_MORE - 1) {
                                break
                            }
                        }
                    }).rejects.toThrow('decrypt')

                    expect(received).toEqual([
                        ...contentClear.slice(0, BAD_INDEX),
                    ])
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

        it('does encrypt messages in stream that does not require encryption but groupkey is set anyway', async () => {
            const stream2 = await createTestStream(publisher, module)

            let didFindStream2 = false

            function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                const onSendTest = Defer()
                // @ts-expect-error private
                testClient.publisher.publishQueue.forEach(onSendTest.wrapError(async ([streamMessage]) => {
                    if (streamMessage.getStreamId() === stream2.id) {
                        didFindStream2 = true
                        testClient.debug('streamMessage.encryptionType', streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.AES)
                        expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
                    }
                })).onFinally(() => {
                    onSendTest.resolve(undefined)
                })

                return onSendTest
            }

            async function testSub(testStream: Stream) {
                const done = Defer()
                const received: any = []
                await grantSubscriberPermissions({ stream: testStream })
                await subscriber.subscribe({
                    streamId: testStream.id,
                }, (parsedContent) => {
                    received.push(parsedContent)
                    if (received.length === NUM_MESSAGES) {
                        done.resolve(undefined)
                    }
                })

                await publisher.updateEncryptionKey({
                    streamId: testStream.id,
                    distributionMethod: 'rotate'
                })
                const published: any[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.onMessage(async ([streamMessage]) => {
                    if (streamMessage.getStreamId() !== testStream.id) { return }
                    published.push(streamMessage.getParsedContent())
                    await publisher.updateEncryptionKey({
                        streamId: testStream.id,
                        distributionMethod: 'rotate'
                    })
                })

                await getPublishTestStreamMessages(publisher, testStream)(NUM_MESSAGES)

                await done

                expect(received).toEqual(published)
            }

            const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

            const groupKey = GroupKey.generate()
            await publisher.updateEncryptionKey({
                streamId: stream.id,
                key: groupKey,
                distributionMethod: 'rotate'
            })

            await testSub(stream)
            await testSub(stream2)
            onEncryptionMessageErr.resolve(undefined)
            await onEncryptionMessageErr
            expect(didFindStream2).toBeTruthy()
        }, TIMEOUT * 2)

        it('sets group key per-stream', async () => {
            const stream2 = await createTestStream(publisher, module)

            function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                const onSendTest = Defer()
                // @ts-expect-error private
                testClient.publisher.publishQueue.forEach(onSendTest.wrapError(async ([streamMessage]) => {
                    testClient.debug({ streamMessage })

                    if (streamMessage.getStreamId() === stream2.id) {
                        expect(streamMessage.groupKeyId).toEqual(groupKey2.id)
                    }

                    if (streamMessage.getStreamId() === stream.id) {
                        expect(streamMessage.groupKeyId).toEqual(groupKey.id)
                    }

                    if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
                        expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
                    } else if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE) {
                        expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.RSA)
                    } else {
                        expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
                    }
                })).onFinally(() => {
                    onSendTest.resolve(undefined)
                })

                return onSendTest
            }

            async function testSub(testStream: Stream) {
                const done = Defer()
                const received: any = []
                await grantSubscriberPermissions({ stream: testStream })
                await subscriber.subscribe({
                    streamId: testStream.id,
                }, (parsedContent) => {
                    received.push(parsedContent)
                    if (received.length === NUM_MESSAGES) {
                        done.resolve(undefined)
                    }
                })

                const contentClear: any[] = []
                // @ts-expect-error private
                publisher.publisher.streamMessageQueue.onMessage(([streamMessage]) => {
                    if (streamMessage.getStreamId() !== testStream.id) { return }
                    contentClear.push(streamMessage.getParsedContent())
                })
                await getPublishTestStreamMessages(publisher, testStream)(NUM_MESSAGES)

                await done

                expect(received).toEqual(contentClear)
            }

            const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

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

            await testSub(stream)
            await testSub(stream2)
            onEncryptionMessageErr.resolve(undefined)
            await onEncryptionMessageErr
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

            sub.onError(onSubError)

            const received: any[] = []
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
                expect(received).toEqual([
                    ...published.slice(0, revokeAfter),
                ])

                expect(onSubError).toHaveBeenCalledTimes(1)
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
