import { wait, waitForCondition, waitForEvent } from 'streamr-test-utils'
import Debug from 'debug'

import { uid, describeRepeats, fakePrivateKey, getWaitForStorage, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const MAX_MESSAGES = 10
const WAIT_FOR_STORAGE_TIMEOUT = 6000

/* eslint-disable no-await-in-loop */

describe('StreamrClient resends', () => {
    describe('resend', () => {
        let expectErrors = 0 // check no errors by default
        let onError = jest.fn()

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

        let client
        let stream
        let published
        let publishTestMessages

        beforeEach(async () => {
            client = createClient()
            await client.connect()

            published = []

            stream = await client.createStream({
                name: uid('resends')
            })

            publishTestMessages = getPublishTestMessages(client, stream.id)

            published = await publishTestMessages(MAX_MESSAGES)

            const waitForStorage = getWaitForStorage(client)
            const lastMessage = published[published.length - 1]
            await waitForStorage({
                msg: lastMessage,
                timeout: WAIT_FOR_STORAGE_TIMEOUT,
                streamId: stream.id,
            })
        })

        beforeEach(async () => {
            await client.connect()
            expectErrors = 0
            onError = jest.fn()
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
            await wait(500)
            if (client) {
                client.debug('disconnecting after test')
                await client.disconnect()
            }

            const openSockets = Connection.getOpen()
            if (openSockets !== 0) {
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        describe('issue resend and subscribe at the same time', () => {
            it('works with resend -> subscribe', async () => {
                const resentMessages = []
                const realtimeMessages = []

                const realtimeMessage = {
                    msg: uid('realtimeMessage'),
                }

                await client.resend({
                    stream: stream.id,
                    resend: {
                        last: MAX_MESSAGES,
                    },
                }, (message) => {
                    resentMessages.push(message)
                })

                await client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    realtimeMessages.push(message)
                })

                await waitForCondition(() => resentMessages.length === MAX_MESSAGES, 5000)
                await Promise.all([
                    client.publish(stream.id, realtimeMessage),
                    waitForCondition(() => realtimeMessages.length === 1, 10000)
                ])
                expect(resentMessages).toStrictEqual(published)
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 18000)

            it('works with subscribe -> resend', async () => {
                const resentMessages = []
                const realtimeMessages = []

                const realtimeMessage = {
                    msg: uid('realtimeMessage'),
                }

                await client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    realtimeMessages.push(message)
                })

                // resend after realtime subscribe
                await client.resend({
                    stream: stream.id,
                    resend: {
                        last: MAX_MESSAGES,
                    },
                }, (message) => {
                    resentMessages.push(message)
                })

                await waitForCondition(() => resentMessages.length === MAX_MESSAGES, 5000)
                await Promise.all([
                    client.publish(stream.id, realtimeMessage),
                    waitForCondition(() => realtimeMessages.length === 1, 5000)
                ])
                expect(resentMessages).toStrictEqual(published)
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 15000)

            it('works with subscribe+resend -> subscribe', async () => {
                const resentMessages = []
                const realtimeMessages = []

                const realtimeMessage = {
                    msg: uid('realtimeMessage'),
                }

                client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: MAX_MESSAGES,
                    },
                }, (message) => {
                    resentMessages.push(message)
                })

                client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    realtimeMessages.push(message)
                })

                await waitForCondition(() => resentMessages.length === MAX_MESSAGES, 5000)
                await Promise.all([
                    client.publish(stream.id, realtimeMessage),
                    waitForCondition(() => realtimeMessages.length === 1, 5000)
                ])
                expect(resentMessages).toStrictEqual([...published, realtimeMessage])
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 15000)

            it('works with subscribe -> subscribe+resend', async () => {
                const resentMessages = []
                const realtimeMessages = []

                const realtimeMessage = {
                    msg: uid('realtimeMessage'),
                }

                client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    realtimeMessages.push(message)
                })

                // subscribe with resend after realtime subscribe
                client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: MAX_MESSAGES,
                    },
                }, (message) => {
                    resentMessages.push(message)
                })

                await waitForCondition(() => resentMessages.length === MAX_MESSAGES, 5000)
                await Promise.all([
                    client.publish(stream.id, realtimeMessage),
                    waitForCondition(() => realtimeMessages.length === 1, 5000)
                ])
                expect(resentMessages).toStrictEqual([...published, realtimeMessage])
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 15000)
        })

        describeRepeats('resend repeats', () => {
            // eslint-disable-next-line no-loop-func
            test('resend last using resend function', async () => {
                const receivedMessages = []

                // eslint-disable-next-line no-await-in-loop
                const sub = await client.resend(
                    {
                        stream: stream.id,
                        resend: {
                            last: MAX_MESSAGES,
                        },
                    },
                    (message) => {
                        receivedMessages.push(message)
                    },
                )

                // eslint-disable-next-line no-loop-func
                sub.once('resent', () => {
                    expect(receivedMessages).toStrictEqual(published)
                })

                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 10000)
            }, 10000 * 1.2)

            // eslint-disable-next-line no-loop-func
            test('resend last using subscribe function', async () => {
                const receivedMessages = []

                // eslint-disable-next-line no-await-in-loop
                const sub = await client.subscribe({
                    stream: stream.id,
                    resend: {
                        last: MAX_MESSAGES,
                    },
                }, (message) => {
                    receivedMessages.push(message)
                })
                // eslint-disable-next-line no-loop-func
                await waitForEvent(sub, 'resent', 10000)
                expect(receivedMessages).toStrictEqual(published)
            }, 10000 * 1.2)
        })

        it('resend last using subscribe and publish messages after resend', async () => {
            const receivedMessages = []

            await client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                receivedMessages.push(message)
            })

            // wait for resend MAX_MESSAGES
            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 20000)
            expect(receivedMessages).toStrictEqual(published)

            // publish after resend, realtime subscription messages
            for (let i = MAX_MESSAGES; i < MAX_MESSAGES * 2; i++) {
                const message = {
                    msg: uid('message'),
                }

                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                published.push(message)
            }

            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES * 2, 10000)
            expect(receivedMessages).toStrictEqual(published)
        }, 40000)

        it('resend last using subscribe and publish realtime messages', async () => {
            const receivedMessages = []

            const sub = await client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                receivedMessages.push(message)
            })

            sub.once('resent', async () => {
                expect(receivedMessages).toStrictEqual(published)
                expect(receivedMessages).toHaveLength(MAX_MESSAGES)
                for (let i = MAX_MESSAGES; i < MAX_MESSAGES * 2; i++) {
                    const message = {
                        msg: uid('message'),
                    }

                    // eslint-disable-next-line no-await-in-loop
                    await client.publish(stream.id, message)
                    published.push(message)
                }
            })

            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES * 2, 20000)
            expect(receivedMessages).toStrictEqual(published)
        }, 40000)

        it('long resend', async (done) => {
            client.debug('disabling verbose logging')
            Debug.disable()

            stream = await client.createStream({
                name: uid('resends')
            })

            const LONG_RESEND = 10000

            publishTestMessages = getPublishTestMessages(client, stream.id)
            published = await publishTestMessages(LONG_RESEND)

            const waitForStorage = getWaitForStorage(client)
            const lastMessage = published[published.length - 1]
            await waitForStorage({
                msg: lastMessage,
                timeout: 60000,
                streamId: stream.id,
            })

            await client.disconnect()

            // resend from LONG_RESEND messages
            await client.connect()
            const receivedMessages = []

            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    from: {
                        timestamp: 0,
                    },
                },
            }, (message) => {
                receivedMessages.push(message)
            })

            sub.once('resent', () => {
                expect(receivedMessages).toEqual(published)
                expect(published.length).toBe(LONG_RESEND)
                done()
            })
        }, 300000)
    })
})
