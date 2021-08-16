import { wait } from 'streamr-test-utils'

import { getPublishTestMessages, fakePrivateKey, describeRepeats, createTestStream } from '../utils'
import { BrubeckClient as StreamrClient } from '../../src/BrubeckClient'

import clientOptions from './config'

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
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        return c
    }

    async function setupClient(opts) {
        // eslint-disable-next-line require-atomic-updates
        client = createClient(opts)
        subscriber = client.subscriber
        client.debug('connecting before test >>')
        await client.session.getSessionToken()
        stream = await createTestStream(client, module, {
            requireSignedData: client.options.publishWithSignature !== 'never'
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
    })

    let subs = []

    beforeEach(async () => {
        const existingSubs = subs
        subs = []
        await Promise.all(existingSubs.map((sub) => (
            sub.return()
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

            const errs = []
            const onSubError = jest.fn((err) => {
                errs.push(err)
            })
            sub.onError(onSubError)

            const BAD_INDEX = 2
            sub.context.pipeline.forEachBefore((streamMessage, index) => {
                if (index === BAD_INDEX) {
                    // eslint-disable-next-line no-param-reassign
                    streamMessage.signature = 'badsignature'
                    sub.debug('inserting bad signature', streamMessage)
                }
            })

            const published = await publishTestMessages(MAX_MESSAGES, {
                timestamp: 111111,
            })

            let t
            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length - 1) {
                    clearTimeout(t)
                    // give it a chance to fail
                    t = setTimeout(() => {
                        sub.return()
                    }, 500)
                }

                if (received.length === published.length) {
                    // failed
                    clearTimeout(t)
                    break
                }
            }

            clearTimeout(t)

            const expectedMessages = [
                // remove bad message
                ...published.slice(0, BAD_INDEX),
                ...published.slice(BAD_INDEX + 1, MAX_MESSAGES)
            ]

            expect(received).toEqual(expectedMessages)
            expect(onSubError).toHaveBeenCalledTimes(1)
            expect(errs).toHaveLength(1)
            errs.forEach((err) => {
                expect(err).toBeInstanceOf(Error)
                expect(err.message).toMatch('signature')
            })
        }, 10000)
    })

    describe('content parsing', () => {
        beforeEach(async () => {
            await setupClient({
                gapFillTimeout: 1000,
                retryResendAfter: 1000,
            })
            await client.connect()
        })

        it('subscribe fails gracefully when content bad', async () => {
            await client.connect()
            const sub = await client.subscribe(stream.id)
            const errs = []
            const onSubError = jest.fn((err) => {
                errs.push(err)
            })
            sub.onError(onSubError)

            const BAD_INDEX = 2
            sub.context.pipeline.mapBefore(async (streamMessage, index) => {
                if (index === BAD_INDEX) {
                    const msg = streamMessage.clone()
                    // eslint-disable-next-line no-param-reassign
                    msg.serializedContent = '{ badcontent'
                    msg.parsedContent = undefined
                    msg.signature = undefined
                    await client.publisher.pipeline.signer.sign(msg)
                    return msg
                }
                return streamMessage
            })

            const published = await publishTestMessages(MAX_MESSAGES, {
                stream,
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
            expect(() => { throw errs[0] }).toThrow('JSON')
            expect(errs).toHaveLength(1)
        }, 10000)
    })
})
