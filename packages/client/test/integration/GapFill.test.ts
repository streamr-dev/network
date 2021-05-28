import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import Connection from '../../src/Connection'

import config from './config'
import { Stream } from '../../src/stream'
import { Subscriber, Subscription } from '../../src/subscribe'
import { MessageRef } from 'streamr-client-protocol/dist/src/protocol/message_layer'
import { StreamrClientOptions } from '../../src'
import { StorageNode } from '../../src/stream/StorageNode'

const MAX_MESSAGES = 10

describeRepeats('GapFill', () => {
    let expectErrors = 0 // check no errors by default
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let onError = jest.fn()
    let client: StreamrClient
    let stream: Stream
    let subscriber: Subscriber

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
            maxGapRequests: 10,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    async function setupClient(opts: StreamrClientOptions) {
        // eslint-disable-next-line require-atomic-updates
        client = createClient(opts)
        subscriber = client.subscriber
        client.debug('connecting before test >>')
        await client.session.getSessionToken()
        stream = await client.createStream({
            requireSignedData: true,
            name: uid('stream')
        })
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

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
        expect(client.getSubscriptions()).toEqual([])
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
        await wait(0)
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

    let subs: Subscription[] = []

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
                gapFillTimeout: 200,
                retryResendAfter: 200,
            })
            await client.connect()
        })

        describe('with resend', () => {
            it('can fill single gap', async () => {
                const sub = await client.subscribe(stream.id)
                const { parse } = client.connection
                let count = 0
                client.connection.parse = (...args) => {
                    const msg: any = parse.call(client.connection, ...args)
                    if (!msg.streamMessage) {
                        return msg
                    }

                    count += 1
                    if (count === 2) {
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    return msg
                }

                expect(subscriber.count(stream.id)).toBe(1)

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

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
                    const msg: any = parse.call(client.connection, ...args)
                    if (!msg.streamMessage) {
                        return msg
                    }

                    count += 1
                    if (count > 1 && count < 4) {
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    return msg
                }

                expect(subscriber.count(stream.id)).toBe(1)

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const received = []
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received).toEqual(published)
                expect(client.connection.getState()).toBe('connected')
            }, 20000)

            it('can fill multiple gaps', async () => {
                const sub = await client.subscribe(stream.id)
                const { parse } = client.connection
                let count = 0
                client.connection.parse = (...args) => {
                    const msg: any = parse.call(client.connection, ...args)
                    if (!msg.streamMessage) {
                        return msg
                    }

                    count += 1
                    if (count === 3 || count === 4 || count === 7) {
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    return msg
                }

                expect(subscriber.count(stream.id)).toBe(1)

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

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

            it('can fill gaps in resends', async () => {
                const { parse } = client.connection
                let count = 0
                client.connection.parse = (...args) => {
                    const msg: any = parse.call(client.connection, ...args)
                    if (!msg.streamMessage) {
                        return msg
                    }

                    count += 1
                    if (count === 3 || count === 4 || count === 7) {
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    return msg
                }

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const sub = await client.resend({
                    stream,
                    last: MAX_MESSAGES,
                })
                const received = []
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    // should not need to explicitly end
                }
                expect(received).toEqual(published)
                expect(client.connection.getState()).toBe('connected')
            }, 60000)

            it('can fill gaps in resends even if gap cannot be filled', async () => {
                const { parse } = client.connection
                let count = 0
                let droppedMsgRef: MessageRef
                client.connection.parse = (...args) => {
                    const msg: any = parse.call(client.connection, ...args)
                    if (!msg.streamMessage) {
                        return msg
                    }

                    count += 1
                    if (count === 3) {
                        if (!droppedMsgRef) {
                            droppedMsgRef = msg.streamMessage.getMessageRef()
                        }
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    if (droppedMsgRef && msg.streamMessage.getMessageRef().compareTo(droppedMsgRef) === 0) {
                        client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                        return null
                    }

                    return msg
                }

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const sub = await client.resend({
                    stream,
                    last: MAX_MESSAGES,
                })
                const received = []
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    // should not need to explicitly end
                }
                expect(received).toEqual(published.filter((_value: any, index: number) => index !== 2))
                expect(client.connection.getState()).toBe('connected')
            }, 60000)

            it('can fill gaps between resend and realtime', async () => {
                // publish 5 messages into storage
                const published = await publishTestMessages(5, {
                    waitForLast: true,
                    waitForLastCount: 5,
                })

                // then simultaneously subscribe with resend & start publishing realtime messages
                const [sub, publishedLater] = await Promise.all([
                    client.subscribe({
                        stream,
                        resend: {
                            last: 5
                        }
                    }),
                    publishTestMessages(5)
                ])

                const received = []
                for await (const m of sub) {
                    received.push(m.getParsedContent())
                    if (received.length === (published.length + publishedLater.length)) {
                        break
                    }
                }

                expect(received).toEqual([...published, ...publishedLater])
                await sub.unsubscribe()
            }, 15000)

            it('rejects resend if no storage assigned', async () => {
                // new stream, assign to storage node not called
                stream = await client.createStream({
                    requireSignedData: true,
                    name: uid('no-storage-stream')
                })

                await expect(async () => {
                    await client.resend({
                        stream,
                        last: MAX_MESSAGES,
                    })
                }).rejects.toThrow('storage')
            }, 15000)

            it('rejects resend+subscribe if no storage assigned', async () => {
                // new stream, assign to storage node not called
                stream = await client.createStream({
                    requireSignedData: true,
                    name: uid('no-storage-stream')
                })

                await expect(async () => {
                    await client.subscribe({
                        stream,
                        resend: {
                            last: 100,
                        }
                    })
                }).rejects.toThrow('storage')
            }, 15000)
        })
    })

    describe('client settings', () => {
        it('can gapfill subscribe', async () => {
            await setupClient({
                gapFillTimeout: 200,
                retryResendAfter: 200,
            })
            await client.connect()
            const { parse } = client.connection
            let count = 0
            let droppedMsgRef: MessageRef
            client.connection.parse = (...args) => {
                const msg: any = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 3) {
                    if (!droppedMsgRef) {
                        droppedMsgRef = msg.streamMessage.getMessageRef()
                    }
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }
                // allow resend request response through

                return msg
            }

            const sub = await client.subscribe({
                stream,
            })

            const publishedTask = publishTestMessages(MAX_MESSAGES, {
                stream,
            })

            const received: any[] = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_MESSAGES) {
                    break
                }
            }
            const published = await publishedTask
            expect(received).toEqual(published)
        }, 20000)

        it('calls gapfill max maxGapRequests times', async () => {
            await setupClient({
                gapFillTimeout: 200,
                retryResendAfter: 200,
                maxGapRequests: 3
            })

            await client.connect()
            const { parse } = client.connection
            const calledResend = jest.fn()
            let count = 0
            let droppedMsgRef: MessageRef
            client.connection.parse = (...args) => {
                const msg: any = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 3) {
                    if (!droppedMsgRef) {
                        droppedMsgRef = msg.streamMessage.getMessageRef()
                    }
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                if (droppedMsgRef && msg.streamMessage.getMessageRef().compareTo(droppedMsgRef) === 0) {
                    // count resends by counting number of times dropped message appears (and is dropped)
                    calledResend()
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                return msg
            }

            const published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
            })

            const sub = await client.resend({
                stream,
                last: MAX_MESSAGES,
            })

            const received: any[] = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_MESSAGES - 1) {
                    break
                }
            }
            expect(received).toEqual(published.filter((_value: any, index: number) => index !== 2))
            expect(client.connection.getState()).toBe('connected')
            expect(calledResend).toHaveBeenCalledTimes(3)
        }, 20000)

        it('subscribe does not crash if gaps found but no storage assigned', async () => {
            await setupClient({
                gapFillTimeout: 200,
                retryResendAfter: 2000,
                maxGapRequests: 99 // would time out test if doesn't give up when seeing no storage assigned
            })

            await client.connect()
            const { parse } = client.connection
            // new stream, assign to storage node not called
            stream = await client.createStream({
                requireSignedData: true,
                name: uid('no-storage-stream')
            })
            const calledResend = jest.fn()
            let count = 0
            let droppedMsgRef: MessageRef
            client.connection.parse = (...args) => {
                const msg: any = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 3) {
                    if (!droppedMsgRef) {
                        droppedMsgRef = msg.streamMessage.getMessageRef()
                    }
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                if (droppedMsgRef && msg.streamMessage.getMessageRef().compareTo(droppedMsgRef) === 0) {
                    calledResend()
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                return msg
            }

            const sub = await client.subscribe({
                stream,
            })

            const publishedTask = publishTestMessages(MAX_MESSAGES, {
                stream,
            })

            const received: any[] = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_MESSAGES - 1) {
                    break
                }
            }
            const published = await publishedTask
            expect(received).toEqual(published.filter((_value: any, index: number) => index !== 2))
            expect(client.connection.getState()).toBe('connected')
            // shouldn't retry if encountered no storage error
            expect(calledResend).toHaveBeenCalledTimes(0)
        }, 20000)

        it('ignores gaps if orderMessages disabled', async () => {
            await setupClient({
                orderMessages: false, // should disable all gapfilling
                gapFillTimeout: 200,
                retryResendAfter: 2000,
                maxGapRequests: 99 // would time out test if doesn't give up
            })

            await client.connect()
            const { parse } = client.connection
            const calledResend = jest.fn()
            let count = 0
            let droppedMsgRef: MessageRef
            client.connection.parse = (...args) => {
                const msg: any = parse.call(client.connection, ...args)
                if (!msg.streamMessage) {
                    return msg
                }

                count += 1
                if (count === 3) {
                    if (!droppedMsgRef) {
                        droppedMsgRef = msg.streamMessage.getMessageRef()
                    }
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                if (droppedMsgRef && msg.streamMessage.getMessageRef().compareTo(droppedMsgRef) === 0) {
                    calledResend()
                    client.debug('(%o) << Test Dropped Message %s: %o', client.connection.getState(), count, msg)
                    return null
                }

                return msg
            }

            const sub = await client.subscribe({
                stream,
            })

            const publishedTask = publishTestMessages(MAX_MESSAGES, {
                stream,
            })

            const received: any[] = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === MAX_MESSAGES - 1) {
                    break
                }
            }
            const published = await publishedTask
            expect(received).toEqual(published.filter((_value: any, index: number) => index !== 2))
            expect(client.connection.getState()).toBe('connected')
            // should not have got any resend responses
            expect(calledResend).toHaveBeenCalledTimes(0)
        }, 20000)
    })
})
