import { wait } from 'streamr-test-utils'
import { BroadcastMessage, ControlMessageType, StreamMessage } from 'streamr-client-protocol'
import { describeRepeats, fakePrivateKey, Msg, getPublishTestMessages, createRelativeTestStreamId, Debug } from '../utils'
import { Defer } from '../../src/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/stream/encryption/Encryption'
import { Stream, StreamOperation } from '../../src/stream'
import Connection from '../../src/Connection'
import { StorageNode } from '../../src/stream/StorageNode'

import { clientOptions } from './devEnvironment'

const debug = Debug('StreamrClient::test')
const TIMEOUT = 15 * 1000

describeRepeats('decryption', () => {
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let expectErrors = 0 // check no errors by default
    let errors: Error[] = []

    const getOnError = (errs: Error[]) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let stream: Stream

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // @ts-expect-error
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)

        return c
    }

    function checkEncryptionMessages(testClient: StreamrClient) {
        const onSendTest = Defer()
        testClient.connection.on('_send', onSendTest.wrapError((sendingMsg) => {
            // check encryption is as expected
            const { streamMessage } = sendingMsg
            if (!streamMessage) {
                return
            }

            if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
            } else if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE) {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.RSA)
            } else {
                expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
            }
        }))
        return onSendTest
    }

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (publisher) {
            expect(publisher.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    async function cleanupClient(client?: StreamrClient, msg = 'disconnecting after test') {
        await wait(0)
        if (client) {
            client.debug(msg)
            await client.disconnect()
        }
    }

    afterEach(async () => {
        await Promise.all([
            cleanupClient(publisher),
            cleanupClient(subscriber),
        ])

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    async function setupClient(opts?: any) {
        const client = createClient(opts)
        await Promise.all([
            client.session.getSessionToken(),
            client.connect(),
        ])
        return client
    }

    async function setupStream() {
        stream = await publisher.createStream({
            id: createRelativeTestStreamId(module),
            requireEncryptedData: true,
        })

        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        publishTestMessages = getPublishTestMessages(publisher, {
            stream
        })
    }

    async function setupPublisherSubscriberClients(opts?: any) {
        debug('set up clients', opts)
        if (publisher) {
            debug('disconnecting old publisher')
            await publisher.disconnect()
        }

        if (subscriber) {
            debug('disconnecting old subscriber')
            await subscriber.disconnect()
        }

        // eslint-disable-next-line require-atomic-updates, semi-style, no-extra-semi
        ;[publisher, subscriber] = await Promise.all([
            setupClient({ id: createRelativeTestStreamId(module, 'publisher'), ...opts }),
            setupClient({ id: createRelativeTestStreamId(module, 'subscriber'), ...opts }),
        ])
    }

    async function grantSubscriberPermissions({ stream: s = stream, client: c = subscriber }: { stream?: Stream, client?: StreamrClient } = {}) {
        const p1 = await s.grantPermission(StreamOperation.STREAM_GET, await c.getPublisherId())
        const p2 = await s.grantPermission(StreamOperation.STREAM_SUBSCRIBE, await c.getPublisherId())
        return [p1, p2]
    }

    describe('using default config', () => {
        beforeEach(async () => {
            await setupPublisherSubscriberClients()
        })

        beforeEach(async () => {
            await setupStream()
        })

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
                    // @ts-expect-error
                    groupKeys: keys,
                }, done.wrap((parsedContent, streamMessage) => {
                    expect(parsedContent).toEqual(msg)
                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId())
                    expect(streamMessage.signature)
                }))

                publisher.once('error', done.reject)
                await publisher.setNextGroupKey(stream.id, groupKey)
                // Publish after subscribed
                await Promise.all([
                    publisher.publish(stream.id, msg),
                    done,
                ])
            })

            it('client.subscribe can get the group key and decrypt encrypted message using an RSA key pair', async () => {
                const done = Defer()
                const msg = Msg()
                const groupKey = GroupKey.generate()
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                }, done.wrap((parsedContent, streamMessage) => {
                    expect(parsedContent).toEqual(msg)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId())
                    expect(streamMessage.signature)
                }))
                sub.once('error', done.reject)

                await publisher.setNextGroupKey(stream.id, groupKey)
                const onEncryptionMessageErr = checkEncryptionMessages(publisher)

                await Promise.all([
                    publisher.publish(stream.id, msg),
                    done,
                ])
                onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
                await onEncryptionMessageErr
            }, TIMEOUT * 2)

            it('changing group key injects group key into next stream message', async () => {
                const done = Defer()
                const msgs = [Msg(), Msg(), Msg()]
                const received: any[] = []
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                }, done.wrapError((_parsedContent, streamMessage) => {
                    // Check signature stuff
                    received.push(streamMessage)
                    if (received.length === msgs.length) {
                        done.resolve(undefined)
                    }
                }))

                sub.once('error', done.reject)

                const onEncryptionMessageErr = checkEncryptionMessages(publisher)
                // id | groupKeyId | newGroupKey (encrypted by groupKeyId)
                // msg1 gk2 -
                // msg2 gk2 gk3
                // msg3 gk3 -
                const groupKey1 = GroupKey.generate()
                const groupKey2 = GroupKey.generate()
                await publisher.setNextGroupKey(stream.id, groupKey1)
                await publisher.publish(stream.id, msgs[0])
                await publisher.setNextGroupKey(stream.id, groupKey2)
                await publisher.publish(stream.id, msgs[1])
                await publisher.publish(stream.id, msgs[2])
                await done
                expect(received.map((m) => m.getParsedContent())).toEqual(msgs)
                received.forEach((streamMessage, index) => {
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId())
                    expect(streamMessage.signature)
                    switch (index) {
                        case 0: {
                            expect(streamMessage.newGroupKey).toEqual(null)
                            expect(streamMessage.groupKeyId).toEqual(groupKey1.id)
                            break
                        }
                        case 1: {
                            expect(streamMessage.newGroupKey).toEqual(groupKey2)
                            expect(streamMessage.groupKeyId).toEqual(groupKey1.id)
                            break
                        }
                        case 2: {
                            expect(streamMessage.newGroupKey).toEqual(null)
                            expect(streamMessage.groupKeyId).toEqual(groupKey2.id)
                            break
                        }
                        default: {
                            throw new Error(`should not get here: ${index}`)
                        }
                    }
                })

                onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
                await onEncryptionMessageErr
            }, TIMEOUT * 2)

            it('allows other users to get group key', async () => {
                const onEncryptionMessageErr = checkEncryptionMessages(publisher)
                const onEncryptionMessageErr2 = checkEncryptionMessages(subscriber)
                const done = Defer()
                const msg = Msg()
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                }, done.wrap((parsedContent, streamMessage) => {
                    expect(parsedContent).toEqual(msg)

                    // Check signature stuff
                    expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                    expect(streamMessage.getPublisherId())
                    expect(streamMessage.signature)
                }))
                sub.once('error', done.reject)

                const groupKey = GroupKey.generate()
                await publisher.setNextGroupKey(stream.id, groupKey)

                await Promise.all([
                    publisher.publish(stream.id, msg),
                    done,
                ])
                onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
                await onEncryptionMessageErr
                onEncryptionMessageErr2.resolve(undefined) // will be ignored if errored
                await onEncryptionMessageErr2
            }, TIMEOUT * 2)

            it('does not encrypt messages in stream without groupkey', async () => {
                const stream2 = await publisher.createStream({
                    id: createRelativeTestStreamId(module),
                    requireEncryptedData: false,
                })

                let didFindStream2 = false

                function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                    const onSendTest = Defer()
                    testClient.connection.on('_send', onSendTest.wrapError((sendingMsg) => {
                        // check encryption is as expected
                        const { streamMessage } = sendingMsg
                        if (!streamMessage) {
                            return
                        }

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
                    }))
                    return onSendTest
                }

                async function testSub(testStream: Stream) {
                    const NUM_MESSAGES = 5
                    const done = Defer()
                    const received: any = []
                    await grantSubscriberPermissions({ stream: testStream })
                    const sub = await subscriber.subscribe({
                        stream: testStream.id,
                    }, done.wrapError((parsedContent) => {
                        received.push(parsedContent)
                        if (received.length === NUM_MESSAGES) {
                            done.resolve(undefined)
                        }
                    }))
                    sub.once('error', done.reject)

                    const published = await publishTestMessages(NUM_MESSAGES, {
                        stream: testStream,
                    })

                    await done

                    expect(received).toEqual(published)
                }

                const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

                const groupKey = GroupKey.generate()
                await publisher.setNextGroupKey(stream.id, groupKey)

                await Promise.all([
                    testSub(stream),
                    testSub(stream2),
                ])
                onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
                await onEncryptionMessageErr
                expect(didFindStream2).toBeTruthy()
            }, TIMEOUT * 2)

            it('client.subscribe can get the group key and decrypt multiple encrypted messages using an RSA key pair', async () => {
                // subscribe without knowing publisher the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const groupKey = GroupKey.generate()
                await publisher.setNextGroupKey(stream.id, groupKey)
                const published = await publishTestMessages()

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === published.length) {
                        break
                    }
                }

                expect(received).toEqual(published)
            }, TIMEOUT * 2)

            it('subscribe with rotating group key', async () => {
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const rawMessages: BroadcastMessage[] = []
                subscriber.connection.on(String(ControlMessageType.BroadcastMessage), (msg) => {
                    rawMessages.push(BroadcastMessage.deserialize(msg.serialize()) as BroadcastMessage)
                })

                const published = await publishTestMessages.raw(5, {
                    async beforeEach() {
                        await publisher.rotateGroupKey(stream.id)
                    }
                })

                // published with encryption
                expect(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
                    .toEqual(published.map(() => StreamMessage.ENCRYPTION_TYPES.AES))

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === published.length) {
                        break
                    }
                }

                expect(received).toEqual(published.map(([msg]) => msg))

                const subMessages = rawMessages.filter(({ streamMessage }) => streamMessage.getStreamId() === stream.id)
                // all messages were encrypted with same encryptionType as published
                expect(subMessages.map(({ streamMessage }) => streamMessage.encryptionType))
                    .toEqual(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
            }, TIMEOUT * 2)

            it('subscribe with rekeying group key', async () => {
                // subscribe without knowing the group key to decrypt stream messages
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const rawMessages: BroadcastMessage[] = []
                subscriber.connection.on(String(ControlMessageType.BroadcastMessage), (msg) => {
                    rawMessages.push(BroadcastMessage.deserialize(msg.serialize()) as BroadcastMessage)
                })

                const published = await publishTestMessages.raw(5, {
                    async beforeEach() {
                        await publisher.rekey(stream.id)
                    }
                })

                // published with encryption
                expect(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
                    .toEqual(published.map(() => StreamMessage.ENCRYPTION_TYPES.AES))

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === published.length) {
                        break
                    }
                }

                expect(received).toEqual(published.map(([msg]) => msg))

                const subMessages = rawMessages.filter(({ streamMessage }) => streamMessage.getStreamId() === stream.id)
                // all messages were encrypted with same encryptionType as published
                expect(subMessages.map(({ streamMessage }) => streamMessage.encryptionType))
                    .toEqual(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
            }, TIMEOUT * 2)

            it('can rotate when publisher + subscriber initialised with groupkey', async () => {
                const groupKey = GroupKey.generate()
                const groupKeys = {
                    [stream.id]: {
                        [groupKey.id]: {
                            groupKeyId: groupKey.id,
                            groupKeyHex: groupKey.hex,
                        }
                    }
                }

                await publisher.disconnect()
                // eslint-disable-next-line require-atomic-updates
                publisher = await setupClient({
                    auth: publisher.options.auth,
                    groupKeys,
                })
                publishTestMessages = getPublishTestMessages(publisher, {
                    stream
                })

                await publisher.connect()
                await publisher.rotateGroupKey(stream.id)
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                })

                const rawMessages: BroadcastMessage[] = []
                subscriber.connection.on(String(ControlMessageType.BroadcastMessage), (msg) => {
                    rawMessages.push(BroadcastMessage.deserialize(msg.serialize()) as BroadcastMessage)
                })

                const published = await publishTestMessages.raw(3)

                // published with encryption
                expect(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
                    .toEqual(published.map(() => StreamMessage.ENCRYPTION_TYPES.AES))

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === published.length) {
                        break
                    }
                }

                expect(received).toEqual(published.map(([msg]) => msg))

                const subMessages = rawMessages.filter(({ streamMessage }) => streamMessage.getStreamId() === stream.id)
                // all messages were encrypted with same encryptionType as published
                expect(subMessages.map(({ streamMessage }) => streamMessage.encryptionType))
                    .toEqual(published.map(([, { streamMessage }]) => streamMessage.encryptionType))
            }, TIMEOUT * 2)

            it('client.resend last can get the historical keys for previous encrypted messages', async () => {
                // Publish encrypted messages with different keys
                const published = await publishTestMessages(5, {
                    waitForLast: true,
                    async beforeEach() {
                        await publisher.rotateGroupKey(stream.id)
                    }
                })

                // resend without knowing the historical keys
                await grantSubscriberPermissions()
                const sub = await subscriber.resend({
                    stream: stream.id,
                    resend: {
                        last: 2,
                    },
                })

                const received = await sub.collect()

                expect(received).toEqual(published.slice(-2))
                await subscriber.unsubscribe(sub)
            }, TIMEOUT * 2)

            it('client.subscribe with resend last can get the historical keys for previous encrypted messages', async () => {
                // Publish encrypted messages with different keys
                const published = await publishTestMessages(5, {
                    waitForLast: true,
                    async beforeEach() {
                        await publisher.rotateGroupKey(stream.id)
                    }
                })

                await grantSubscriberPermissions()
                // subscribe with resend without knowing the historical keys
                const sub = await subscriber.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 2,
                    },
                })

                const received = []
                for await (const msg of sub) {
                    received.push(msg.getParsedContent())
                    if (received.length === 2) {
                        break
                    }
                }

                expect(received).toEqual(published.slice(-2))
                await subscriber.unsubscribe(sub)
            }, TIMEOUT * 2)

            it('fails gracefully if cannot decrypt', async () => {
                const MAX_MESSAGES = 10
                const groupKey = GroupKey.generate()
                const keys = {
                    [stream.id]: {
                        [groupKey.id]: groupKey,
                    }
                }

                await publisher.setNextGroupKey(stream.id, groupKey)

                const BAD_INDEX = 6
                let count = 0
                const { parse } = subscriber.connection
                subscriber.connection.parse = (...args) => {
                    const msg = parse.call(subscriber.connection, ...args)
                    if (!('streamMessage' in msg)) {
                        return msg
                    }

                    if (count === BAD_INDEX) {
                        // @ts-expect-error
                        msg.streamMessage.groupKeyId = 'badgroupkey'
                    }

                    count += 1
                    return msg
                }

                const sub = await subscriber.subscribe({
                    stream: stream.id,
                    // @ts-expect-error
                    groupKeys: keys,
                })

                const onSubError = jest.fn((err) => {
                    expect(err).toBeInstanceOf(Error)
                    expect(err.message).toMatch('decrypt')
                })

                sub.on('error', onSubError)

                // Publish after subscribed
                const published = await publishTestMessages(MAX_MESSAGES, {
                    timestamp: 1111111,
                })

                const received = []
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    if (received.length === published.length - 1) {
                        break
                    }
                }

                expect(received).toEqual([
                    ...published.slice(0, BAD_INDEX),
                    ...published.slice(BAD_INDEX + 1, MAX_MESSAGES)
                ])

                expect(onSubError).toHaveBeenCalledTimes(1)
            })
        })

        it('errors if rotating group key for no stream', async () => {
            expect(async () => (
                // @ts-expect-error
                publisher.rotateGroupKey()
            )).rejects.toThrow('streamId')
        })

        it('errors if setting group key for no stream', async () => {
            await expect(async () => {
                // @ts-expect-error
                await publisher.setNextGroupKey(undefined, GroupKey.generate())
            }).rejects.toThrow('streamId')
        })

        it('does encrypt messages in stream that does not require encryption but groupkey is set anyway', async () => {
            const stream2 = await publisher.createStream({
                id: createRelativeTestStreamId(module),
                requireEncryptedData: false,
            })

            let didFindStream2 = false

            function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                const onSendTest = Defer()
                testClient.connection.on('_send', onSendTest.wrapError((sendingMsg) => {
                    // check encryption is as expected
                    const { streamMessage } = sendingMsg
                    if (!streamMessage) {
                        return
                    }

                    if (streamMessage.getStreamId() === stream2.id) {
                        didFindStream2 = true
                        expect(streamMessage.encryptionType).toEqual(StreamMessage.ENCRYPTION_TYPES.AES)
                    }
                }))
                return onSendTest
            }

            async function testSub(testStream: Stream) {
                const NUM_MESSAGES = 5
                const done = Defer()
                const received: any = []
                await grantSubscriberPermissions({ stream: testStream })
                const sub = await subscriber.subscribe({
                    stream: testStream.id,
                }, done.wrapError((parsedContent) => {
                    received.push(parsedContent)
                    if (received.length === NUM_MESSAGES) {
                        done.resolve(undefined)
                    }
                }))
                sub.once('error', done.reject)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    stream: testStream,
                    async beforeEach() {
                        await publisher.rotateGroupKey(stream2.id)
                    }
                })

                await done

                expect(received).toEqual(published)
            }

            const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

            const groupKey = GroupKey.generate()
            await publisher.setNextGroupKey(stream.id, groupKey)

            await Promise.all([
                testSub(stream),
                testSub(stream2),
            ])
            onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
            await onEncryptionMessageErr
            expect(didFindStream2).toBeTruthy()
        }, TIMEOUT * 2)

        it('sets group key per-stream', async () => {
            const stream2 = await publisher.createStream({
                id: createRelativeTestStreamId(module),
                requireEncryptedData: true,
            })

            const groupKey = GroupKey.generate()
            await publisher.setNextGroupKey(stream.id, groupKey)
            const groupKey2 = GroupKey.generate()
            await publisher.setNextGroupKey(stream2.id, groupKey2)

            function checkEncryptionMessagesPerStream(testClient: StreamrClient) {
                const onSendTest = Defer()
                testClient.connection.on('_send', onSendTest.wrapError((sendingMsg) => {
                    // check encryption is as expected
                    const { streamMessage } = sendingMsg
                    if (!streamMessage) {
                        return
                    }

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
                }))
                return onSendTest
            }

            async function testSub(testStream: Stream) {
                const NUM_MESSAGES = 5
                const done = Defer()
                const received: any[] = []
                await grantSubscriberPermissions({ stream: testStream })
                const sub = await subscriber.subscribe({
                    stream: testStream.id,
                }, done.wrapError((parsedContent) => {
                    received.push(parsedContent)
                    if (received.length === NUM_MESSAGES) {
                        done.resolve(undefined)
                    }
                }))
                sub.once('error', done.reject)

                const published = await publishTestMessages(NUM_MESSAGES, {
                    stream: testStream,
                })

                await done

                expect(received).toEqual(published)
            }

            const onEncryptionMessageErr = checkEncryptionMessagesPerStream(publisher)

            await Promise.all([
                testSub(stream),
                testSub(stream2),
            ])
            onEncryptionMessageErr.resolve(undefined) // will be ignored if errored
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
            // check that subscriber only got messages from before permission revoked
            // and subscriber errored with something about group key or
            // permissions

            await publisher.rotateGroupKey(stream.id)

            await stream.grantPermission(StreamOperation.STREAM_GET, await subscriber.getPublisherId())
            const subPermission = await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, await subscriber.getPublisherId())

            const sub = await subscriber.subscribe({
                stream: stream.id,
            })

            const errs: Error[] = []
            const onSubError = jest.fn((err: Error) => {
                errs.push(err)
                throw err // this should trigger unsub
            })

            sub.on('error', onSubError)

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
                        await stream.revokePermission(subPermission.id)
                        await publisher.rekey(stream.id)
                    }
                }
            })

            subscriber.debug('\n\n1\n\n')
            let t!: ReturnType<typeof setTimeout>
            const timedOut = jest.fn()
            try {
                await expect(async () => {
                    for await (const m of sub) {
                        subscriber.debug('got', m.getParsedContent())
                        received.push(m.getParsedContent())
                        if (received.length === revokeAfter) {
                            gotMessages.resolve(undefined)
                            clearTimeout(t)
                            t = setTimeout(() => {
                                timedOut()
                                sub.cancel()
                            }, 6000)
                        }

                        if (received.length === maxMessages) {
                            clearTimeout(t)
                            break
                        }
                    }
                }).rejects.toThrow(/not a subscriber|Could not get GroupKey/)
            } finally {
                clearTimeout(t)
                // run in finally to ensure publish promise finishes before
                // continuing no matter the result of the expect call above
                const published = await publishTask

                expect(received).toEqual([
                    ...published.slice(0, revokeAfter),
                ])

                expect(onSubError).toHaveBeenCalledTimes(1)
                expect(timedOut).toHaveBeenCalledTimes(0)
            }
        }

        describe('low cache maxAge', () => {
            beforeEach(async () => {
                await setupPublisherSubscriberClients({
                    cache: {
                        maxAge: 1,
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
