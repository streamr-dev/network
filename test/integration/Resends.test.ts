import { wait, waitForCondition, waitForEvent } from 'streamr-test-utils'

import { uid, describeRepeats, fakePrivateKey, getPublishTestMessages } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer, pTimeout } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'
import { Stream } from '../../src/stream'

const MAX_MESSAGES = 10
const WAIT_FOR_STORAGE_TIMEOUT = 6000

/* eslint-disable no-await-in-loop */

describe('StreamrClient resends', () => {
    describe('resend', () => {
        let expectErrors = 0 // check no errors by default
        let onError = jest.fn()

        const createClient = (opts = {}) => {
            const c = new StreamrClient({
                ...config.clientOptions,
                auth: {
                    privateKey: fakePrivateKey(),
                },
                autoConnect: false,
                autoDisconnect: false,
                // @ts-expect-error
                maxRetries: 2,
                ...opts,
            })
            c.onError = jest.fn()
            c.on('error', onError)
            return c
        }

        let client: StreamrClient
        let stream: Stream
        let published: any[]
        let publishTestMessages: ReturnType<typeof getPublishTestMessages>

        beforeEach(async () => {
            client = createClient()
            await client.connect()
            expectErrors = 0
            onError = jest.fn()
        })

        afterEach(async () => {
            await wait(0)
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
                await Connection.closeOpen()
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        describe('short resend', () => {
            beforeEach(async () => {
                stream = await client.createStream({
                    name: uid('resends')
                })

                await stream.addToStorageNode(config.clientOptions.storageNode.address)
            })

            beforeEach(async () => {
                publishTestMessages = getPublishTestMessages(client, {
                    stream
                })
                published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                    waitForLastTimeout: WAIT_FOR_STORAGE_TIMEOUT,
                })
            }, WAIT_FOR_STORAGE_TIMEOUT * 2)

            describe('issue resend and subscribe at the same time', () => {
                it('works with resend -> subscribe', async () => {
                    const resentMessages: any[] = []
                    const realtimeMessages: any[] = []

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
                        streamId: stream.id,
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
                    const resentMessages: any[] = []
                    const realtimeMessages: any[] = []

                    const realtimeMessage = {
                        msg: uid('realtimeMessage'),
                    }

                    await client.subscribe({
                        streamId: stream.id,
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
                    const resentMessages: any[] = []
                    const realtimeMessages: any[] = []

                    const realtimeMessage = {
                        msg: uid('realtimeMessage'),
                    }

                    client.subscribe({
                        streamId: stream.id,
                        resend: {
                            last: MAX_MESSAGES,
                        },
                    }, (message) => {
                        resentMessages.push(message)
                    })

                    client.subscribe({
                        streamId: stream.id,
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
                    const resentMessages: any[] = []
                    const realtimeMessages: any[] = []

                    const realtimeMessage = {
                        msg: uid('realtimeMessage'),
                    }

                    client.subscribe({
                        streamId: stream.id,
                    }, (message) => {
                        realtimeMessages.push(message)
                    })

                    // subscribe with resend after realtime subscribe
                    client.subscribe({
                        streamId: stream.id,
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
                    const receivedMessages: any[] = []

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
                    const receivedMessages: any[] = []

                    // eslint-disable-next-line no-await-in-loop
                    const sub = await client.subscribe({
                        streamId: stream.id,
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
                const receivedMessages: any[] = []

                await client.subscribe({
                    streamId: stream.id,
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
                const receivedMessages: any[] = []

                const sub = await client.subscribe({
                    streamId: stream.id,
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
        })

        describe('long resend', () => {
            const LONG_RESEND = 500

            beforeEach(async () => {
                stream = await client.createStream({
                    name: uid('resends')
                })

                await stream.addToStorageNode(config.clientOptions.storageNode.address)

                publishTestMessages = getPublishTestMessages(client, {
                    stream
                })
            })

            beforeEach(async () => {
                client.debug(`Publishing ${LONG_RESEND} messages...`)
                published = await publishTestMessages(LONG_RESEND, {
                    waitForLast: true,
                })
                client.debug(`Published ${LONG_RESEND} messages`)
                await client.disconnect()
            }, 300000)

            test('receives all messages', async () => {
                // resend from LONG_RESEND messages
                await client.connect()

                const receivedMessages: any[] = []
                const onGotFirstMessage = Defer()
                const sub = await client.resend({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, (msg) => {
                    receivedMessages.push(msg)
                    if (receivedMessages.length === 1) {
                        onGotFirstMessage.resolve(undefined)
                    }
                })

                await pTimeout(onGotFirstMessage, 5000, 'waiting for first resent message')
                client.debug('got first message')
                client.debug('waiting for all messages')
                await sub.onDone()
                client.debug('subscription done')

                expect(receivedMessages).toEqual(published)
                expect(published.length).toBe(LONG_RESEND)
            }, 300000)
        // @ts-expect-error
        }, 300000)
    })
})
