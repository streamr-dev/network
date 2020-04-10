import { ethers } from 'ethers'

import { uid } from '../utils'
import StreamrClient from '../../src'

import config from './config'

const { wait, waitForCondition } = require('streamr-test-utils')

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

const MAX_MESSAGES = 10
const TEST_REPEATS = 10

describe('StreamrClient resends', () => {
    describe('resend', () => {
        let client
        let stream
        let publishedMessages

        beforeEach(async () => {
            client = createClient()
            await client.ensureConnected()

            publishedMessages = []

            stream = await client.createStream({
                name: uid('resends')
            })

            for (let i = 0; i < MAX_MESSAGES; i++) {
                const message = {
                    msg: uid('message'),
                }

                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                publishedMessages.push(message)
            }

            await wait(5000) // wait for messages to (hopefully) land in storage
        }, 10 * 1000)

        afterEach(async () => {
            await client.ensureDisconnected()
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

                client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    realtimeMessages.push(message)
                })

                await waitForCondition(() => resentMessages.length === MAX_MESSAGES, 5000)
                await Promise.all([
                    client.publish(stream.id, realtimeMessage),
                    waitForCondition(() => realtimeMessages.length === 1, 10000)
                ])
                expect(resentMessages).toStrictEqual(publishedMessages)
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 18000)

            it('works with subscribe -> resend', async () => {
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
                expect(resentMessages).toStrictEqual(publishedMessages)
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
                expect(resentMessages).toStrictEqual([...publishedMessages, realtimeMessage])
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
                expect(resentMessages).toStrictEqual([...publishedMessages, realtimeMessage])
                expect(realtimeMessages).toStrictEqual([realtimeMessage])
            }, 15000)
        })

        for (let i = 0; i < TEST_REPEATS; i++) {
            // eslint-disable-next-line no-loop-func
            it(`resend last using resend function on try ${i}`, async () => {
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
                    expect(receivedMessages).toStrictEqual(publishedMessages)
                })

                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 10000)
            }, 10000)
        }

        for (let i = 0; i < TEST_REPEATS; i++) {
            // eslint-disable-next-line no-loop-func
            it(`resend last using subscribe function on try ${i}`, async () => {
                const receivedMessages = []

                // eslint-disable-next-line no-await-in-loop
                const sub = client.subscribe(
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
                    expect(receivedMessages)
                        .toStrictEqual(publishedMessages)
                })

                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 10000)
            }, 10000)
        }

        it('resend last using subscribe and publish messages after resend', async () => {
            const receivedMessages = []

            client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                receivedMessages.push(message)
            })

            // wait for resend MAX_MESSAGES
            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 10000)
            expect(receivedMessages).toStrictEqual(publishedMessages)

            // publish after resend, realtime subscription messages
            for (let i = MAX_MESSAGES; i < MAX_MESSAGES * 2; i++) {
                const message = {
                    msg: uid('message'),
                }

                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                publishedMessages.push(message)
            }

            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES * 2, 10000)
            expect(receivedMessages).toStrictEqual(publishedMessages)
        }, 30000)

        it('resend last using subscribe and publish realtime messages', async () => {
            const receivedMessages = []

            const sub = client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                receivedMessages.push(message)
            })

            sub.on('subscribed', async () => {
                for (let i = MAX_MESSAGES; i < MAX_MESSAGES * 2; i++) {
                    const message = {
                        msg: uid('message'),
                    }

                    // eslint-disable-next-line no-await-in-loop
                    await client.publish(stream.id, message)
                    publishedMessages.push(message)
                }
            })

            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES * 2, 10000)
            expect(receivedMessages).toEqual(publishedMessages)
        }, 30000)
    })
})
