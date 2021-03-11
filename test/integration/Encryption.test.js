import { wait } from 'streamr-test-utils'
import { MessageLayer } from 'streamr-client-protocol'

import { fakePrivateKey, uid, Msg, getPublishTestMessages } from '../utils'
import { Defer } from '../../src/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/stream/Encryption'
import Connection from '../../src/Connection'

import config from './config'

const TIMEOUT = 30 * 1000

const { StreamMessage } = MessageLayer

describe('decryption', () => {
    let publishTestMessages
    let expectErrors = 0 // check no errors by default
    let errors = []

    const getOnError = (errs) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client
    let stream

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)

        return c
    }

    function checkEncryptionMessages(testClient) {
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
        await wait()
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    beforeEach(async () => {
        client = createClient()
        await Promise.all([
            client.session.getSessionToken(),
            client.connect(),
        ])

        const name = uid('stream')
        stream = await client.createStream({
            name,
            requireEncryptedData: true,
        })

        publishTestMessages = getPublishTestMessages(client, {
            stream
        })
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
        const sub = await client.subscribe({
            stream: stream.id,
            groupKeys: keys,
        }, done.wrap((parsedContent, streamMessage) => {
            expect(parsedContent).toEqual(msg)
            // Check signature stuff
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
            expect(streamMessage.getPublisherId())
            expect(streamMessage.signature)
        }))

        client.once('error', done.reject)
        client.setNextGroupKey(stream.id, groupKey)
        // Publish after subscribed
        await Promise.all([
            client.publish(stream.id, msg),
            done,
        ])
        // All good, unsubscribe
        await client.unsubscribe(sub)
    })

    it('client.subscribe can get the group key and decrypt encrypted message using an RSA key pair', async () => {
        const done = Defer()
        const msg = Msg()
        const groupKey = GroupKey.generate()
        // subscribe without knowing the group key to decrypt stream messages
        const sub = await client.subscribe({
            stream: stream.id,
        }, done.wrap((parsedContent, streamMessage) => {
            expect(parsedContent).toEqual(msg)

            // Check signature stuff
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
            expect(streamMessage.getPublisherId())
            expect(streamMessage.signature)
        }))
        sub.once('error', done.reject)

        await client.setNextGroupKey(stream.id, groupKey)
        const onEncryptionMessageErr = checkEncryptionMessages(client)

        await Promise.all([
            client.publish(stream.id, msg),
            done,
        ])
        onEncryptionMessageErr.resolve() // will be ignored if errored
        await onEncryptionMessageErr
        // All good, unsubscribe
        await client.unsubscribe(sub)
    }, 2 * TIMEOUT)

    it('errors if rotating group key for no stream', async () => {
        expect(async () => (
            client.rotateGroupKey()
        )).rejects.toThrow('streamId')
    })

    it('errors if setting group key for no stream', async () => {
        expect(async () => (
            client.setNextGroupKey(undefined, GroupKey.generate())
        )).rejects.toThrow('streamId')
    })

    it('allows other users to get group key', async () => {
        let otherClient
        let sub
        try {
            otherClient = createClient({
                autoConnect: true,
                autoDisconnect: true,
            })

            const onEncryptionMessageErr = checkEncryptionMessages(client)
            const onEncryptionMessageErr2 = checkEncryptionMessages(otherClient)
            const otherUser = await otherClient.getUserInfo()
            await stream.grantPermission('stream_get', otherUser.username)
            await stream.grantPermission('stream_subscribe', otherUser.username)

            const done = Defer()
            const msg = Msg()
            // subscribe without knowing the group key to decrypt stream messages
            sub = await otherClient.subscribe({
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
            await client.setNextGroupKey(stream.id, groupKey)

            await Promise.all([
                client.publish(stream.id, msg),
                done,
            ])
            onEncryptionMessageErr.resolve() // will be ignored if errored
            await onEncryptionMessageErr
            onEncryptionMessageErr2.resolve() // will be ignored if errored
            await onEncryptionMessageErr2
        } finally {
            if (otherClient) {
                if (sub) {
                    await otherClient.unsubscribe(sub)
                }
                await otherClient.disconnect()
                await otherClient.logout()
            }
        }
    }, 2 * TIMEOUT)

    it('does not encrypt messages in stream without groupkey', async () => {
        const name = uid('stream')
        const stream2 = await client.createStream({
            name,
            requireEncryptedData: false,
        })

        let didFindStream2 = false

        function checkEncryptionMessagesPerStream(testClient) {
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

        async function testSub(testStream) {
            const NUM_MESSAGES = 5
            const done = Defer()
            const received = []
            const sub = await client.subscribe({
                stream: testStream.id,
            }, done.wrapError((parsedContent) => {
                received.push(parsedContent)
                if (received.length === NUM_MESSAGES) {
                    done.resolve()
                }
            }))
            sub.once('error', done.reject)

            const published = await publishTestMessages(NUM_MESSAGES, {
                stream: testStream,
            })

            await done

            expect(received).toEqual(published)
        }

        const onEncryptionMessageErr = checkEncryptionMessagesPerStream(client)

        const groupKey = GroupKey.generate()
        await client.setNextGroupKey(stream.id, groupKey)

        await Promise.all([
            testSub(stream),
            testSub(stream2),
        ])
        onEncryptionMessageErr.resolve() // will be ignored if errored
        await onEncryptionMessageErr
        expect(didFindStream2).toBeTruthy()
    }, 2 * TIMEOUT)

    it('sets group key per-stream', async () => {
        const name = uid('stream')
        const stream2 = await client.createStream({
            name,
            requireEncryptedData: true,
        })

        const groupKey = GroupKey.generate()
        await client.setNextGroupKey(stream.id, groupKey)
        const groupKey2 = GroupKey.generate()
        await client.setNextGroupKey(stream2.id, groupKey2)

        function checkEncryptionMessagesPerStream(testClient) {
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

        async function testSub(testStream) {
            const NUM_MESSAGES = 5
            const done = Defer()
            const received = []
            const sub = await client.subscribe({
                stream: testStream.id,
            }, done.wrapError((parsedContent) => {
                received.push(parsedContent)
                if (received.length === NUM_MESSAGES) {
                    done.resolve()
                }
            }))
            sub.once('error', done.reject)

            const published = await publishTestMessages(NUM_MESSAGES, {
                stream: testStream,
            })

            await done

            expect(received).toEqual(published)
        }

        const onEncryptionMessageErr = checkEncryptionMessagesPerStream(client)

        await Promise.all([
            testSub(stream),
            testSub(stream2),
        ])
        onEncryptionMessageErr.resolve() // will be ignored if errored
        await onEncryptionMessageErr
    }, 2 * TIMEOUT)

    it('client.subscribe can get the group key and decrypt multiple encrypted messages using an RSA key pair', async () => {
        // subscribe without knowing the group key to decrypt stream messages
        const sub = await client.subscribe({
            stream: stream.id,
        })

        const groupKey = GroupKey.generate()
        await client.setNextGroupKey(stream.id, groupKey)
        const published = await publishTestMessages()

        const received = []
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
            if (received.length === published.length) {
                return
            }
        }

        expect(received).toEqual(published)

        // All good, unsubscribe
        await client.unsubscribe(sub)
    }, 2 * TIMEOUT)

    it('subscribe with changing group key', async () => {
        // subscribe without knowing the group key to decrypt stream messages
        const sub = await client.subscribe({
            stream: stream.id,
        })

        const published = await publishTestMessages(5, {
            async beforeEach() {
                await client.rotateGroupKey(stream.id)
            }
        })

        const received = []
        for await (const msg of sub) {
            received.push(msg.getParsedContent())
            if (received.length === published.length) {
                return
            }
        }

        expect(received).toEqual(published)

        // All good, unsubscribe
        await client.unsubscribe(sub)
    }, 2 * TIMEOUT)

    it('client.resend last can get the historical keys for previous encrypted messages', async () => {
        // Publish encrypted messages with different keys
        const published = await publishTestMessages(5, {
            waitForLast: true,
            async beforeEach() {
                await client.rotateGroupKey(stream.id)
            }
        })

        // resend without knowing the historical keys
        const sub = await client.resend({
            stream: stream.id,
            resend: {
                last: 2,
            },
        })

        const received = await sub.collect()

        expect(received).toEqual(published.slice(-2))
        await client.unsubscribe(sub)
    }, 2 * TIMEOUT)

    it('client.subscribe with resend last can get the historical keys for previous encrypted messages', async () => {
        // Publish encrypted messages with different keys
        const published = await publishTestMessages(5, {
            waitForLast: true,
            async beforeEach() {
                await client.rotateGroupKey(stream.id)
            }
        })

        // subscribe with resend without knowing the historical keys
        const sub = await client.subscribe({
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
        await client.unsubscribe(sub)
    }, 2 * TIMEOUT)

    it('fails gracefully if cannot decrypt', async () => {
        const MAX_MESSAGES = 10
        const groupKey = GroupKey.generate()
        const keys = {
            [stream.id]: {
                [groupKey.id]: groupKey,
            }
        }

        await client.setNextGroupKey(stream.id, groupKey)

        const BAD_INDEX = 6
        let count = 0
        const { parse } = client.connection
        client.connection.parse = (...args) => {
            const msg = parse.call(client.connection, ...args)
            if (!msg.streamMessage) {
                return msg
            }

            if (count === BAD_INDEX) {
                msg.streamMessage.groupKeyId = 'badgroupkey'
            }

            count += 1
            return msg
        }

        const sub = await client.subscribe({
            stream: stream.id,
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
