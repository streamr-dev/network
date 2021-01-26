import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const MAX_MESSAGES = 10

describeRepeats('Validation', () => {
    let expectErrors = 0 // check no errors by default
    let publishTestMessages
    let onError = jest.fn()
    let client
    let stream
    let subscriber

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    async function setupClient(opts) {
        // eslint-disable-next-line require-atomic-updates
        client = createClient(opts)
        subscriber = client.subscriber
        client.debug('connecting before test >>')
        await client.session.getSessionToken()
        stream = await client.createStream({
            requireSignedData: client.options.publishWithSignature !== 'never',
            name: uid('stream')
        })

        client.debug('connecting before test <<')
        publishTestMessages = getPublishTestMessages(client, stream.id)
        return client
    }

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
    })

    afterEach(() => {
        if (!subscriber) { return }
        expect(subscriber.count(stream.id)).toBe(0)
        if (!client) { return }
        expect(client.getSubscriptions(stream.id)).toEqual([])
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test >>')
            await client.disconnect()
            client.debug('disconnecting after test <<')
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    let subs = []

    beforeEach(async () => {
        const existingSubs = subs
        subs = []
        await Promise.all(existingSubs.map((sub) => (
            sub.cancel()
        )))
    })

    describe('signature validation', () => {
        beforeEach(async () => {
            await setupClient({
                gapFillTimeout: 1000,
                retryResendAfter: 1000,
            })
            await client.connect()
        })

        it('subscribe fails gracefully when signature bad', async () => {
            const sub = await client.subscribe(stream.id)
            const onSubError = jest.fn((err) => {
                expect(err).toBeInstanceOf(Error)
                expect(err.message).toMatch('signature')
            })
            sub.on('error', onSubError)
            const { parse } = client.connection
            let count = 0
            const BAD_INDEX = 2
            client.connection.parse = (...args) => {
                const msg = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                if (count === BAD_INDEX) {
                    msg.streamMessage.signature = 'badsignature'
                }

                count += 1
                return msg
            }

            const published = await publishTestMessages(MAX_MESSAGES)

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
            expect(client.connection.getState()).toBe('connected')
            expect(onSubError).toHaveBeenCalledTimes(1)
        }, 10000)
    })

    describe('content parsing', () => {
        beforeEach(async () => {
            await setupClient({
                gapFillTimeout: 1000,
                retryResendAfter: 1000,
                publishWithSignature: 'never',
            })
            await client.connect()
        })

        it('subscribe fails gracefully when content bad', async () => {
            await client.connect()
            const sub = await client.subscribe(stream.id)
            const onSubError = jest.fn((err) => {
                expect(err).toBeInstanceOf(Error)
                expect(err.message).toMatch('JSON')
            })

            sub.on('error', onSubError)
            const { parse } = client.connection
            let count = 0
            const BAD_INDEX = 2
            client.connection.parse = (...args) => {
                const msg = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                if (count === BAD_INDEX) {
                    msg.streamMessage.serializedContent = '{ badcontent'
                }

                count += 1
                return msg
            }

            const published = await publishTestMessages(MAX_MESSAGES, {
                stream,
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
            expect(client.connection.getState()).toBe('connected')
            expect(onSubError).toHaveBeenCalledTimes(1)
        }, 10000)
    })
})
