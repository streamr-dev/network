import crypto from 'crypto'

import { wait } from 'streamr-test-utils'
import { MessageLayer } from 'streamr-client-protocol'

import { fakePrivateKey, uid, Msg, getPublishTestMessages } from '../utils'
import { Defer } from '../../src/utils'
import StreamrClient from '../../src'
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
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
            maxRetries: 2,
            ...config.clientOptions,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)

        return c
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
        const keys = new Map()
        const msg = Msg()
        keys.set(groupKey.id, groupKey)
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

        await Promise.all([
            client.publish(stream.id, msg),
            done,
        ])
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
            const otherUser = await otherClient.getUserInfo()
            await stream.grantPermission('stream_get', otherUser.username)
            await stream.grantPermission('stream_subscribe', otherUser.username)

            const done = Defer()
            const msg = Msg()
            const groupKey = GroupKey.generate()
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

            await client.setNextGroupKey(stream.id, groupKey)

            await Promise.all([
                client.publish(stream.id, msg),
                done,
            ])
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
    it('client.subscribe can get the group key and decrypt multiple encrypted messages using an RSA key pair', async () => {
        const groupKey = GroupKey.generate()
        // subscribe without knowing the group key to decrypt stream messages
        const sub = await client.subscribe({
            stream: stream.id,
        })

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
                await client.setNextGroupKey(stream.id, GroupKey.generate())
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
                await client.setNextGroupKey(stream.id, GroupKey.generate())
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
})

