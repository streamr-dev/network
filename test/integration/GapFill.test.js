import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const MAX_MESSAGES = 10

describeRepeats('GapFill', () => {
    let expectErrors = 0 // check no errors by default
    let publishTestMessages
    let onError = jest.fn()
    let client
    let stream
    let subscriber

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...config.clientOptions,
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
            requireSignedData: true,
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

    describe('filling gaps', () => {
        beforeEach(async () => {
            await setupClient({
                gapFillTimeout: 1000,
                retryResendAfter: 1000,
            })
            await client.connect()
        })

        it('can fill single gap', async () => {
            const sub = await client.subscribe(stream.id)
            const { parse } = client.connection
            let count = 0
            client.connection.parse = (...args) => {
                const msg = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 2) {
                    return null
                }

                return msg
            }

            expect(subscriber.count(stream.id)).toBe(1)

            const published = await publishTestMessages(MAX_MESSAGES)

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
            expect(client.connection.getState()).toBe('connected')
        }, 10000)

        it('can fill gap of multiple messages', async () => {
            const sub = await client.subscribe(stream.id)
            const { parse } = client.connection
            let count = 0
            client.connection.parse = (...args) => {
                const msg = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count > 1 && count < 5) {
                    return null
                }

                return msg
            }

            expect(subscriber.count(stream.id)).toBe(1)

            const published = await publishTestMessages(MAX_MESSAGES)

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
            expect(client.connection.getState()).toBe('connected')
        }, 10000)

        it('can fill multiple gaps', async () => {
            const sub = await client.subscribe(stream.id)
            const { parse } = client.connection
            let count = 0
            client.connection.parse = (...args) => {
                const msg = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 3 || count === 4 || count === 7) {
                    return null
                }

                return msg
            }

            expect(subscriber.count(stream.id)).toBe(1)

            const published = await publishTestMessages(MAX_MESSAGES)

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
            expect(client.connection.getState()).toBe('connected')
        }, 15000)
    })
})
