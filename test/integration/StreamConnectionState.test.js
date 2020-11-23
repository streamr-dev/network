import { wait } from 'streamr-test-utils'
import { ControlLayer } from 'streamr-client-protocol'

import { uid, fakePrivateKey, describeRepeats, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'

const { ControlMessage } = ControlLayer
const MAX_MESSAGES = 5

describeRepeats('Connection State', () => {
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

    describe('autoConnect/Disconnect enabled', () => {
        beforeEach(async () => {
            await setupClient({ // new client with autoConnect
                autoConnect: true,
                autoDisconnect: true,
            })
            // don't explicitly connect
        })

        it('connects on subscribe, disconnects on end', async () => {
            const sub = await subscriber.subscribe(stream.id)
            expect(client.connection.getState()).toBe('connected')
            expect(subscriber.count(stream.id)).toBe(1)

            const published = await publishTestMessages()

            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }
            expect(received).toEqual(published)
            expect(client.connection.getState()).toBe('disconnected')
        })

        it('connects on subscribe, disconnects on end with two subs', async () => {
            const [sub1, sub2] = await Promise.all([
                subscriber.subscribe(stream.id),
                subscriber.subscribe(stream.id),
            ])

            expect(client.connection.getState()).toBe('connected')
            expect(subscriber.count(stream.id)).toBe(2)

            const published = await publishTestMessages()

            const received1 = []
            for await (const m of sub1) {
                received1.push(m.getParsedContent())
                if (received1.length === published.length) {
                    break
                }
            }

            expect(received1).toEqual(published)
            expect(client.connection.getState()).toBe('connected')

            const received2 = []
            for await (const m of sub2) {
                received2.push(m)
                if (received2.length === published.length) {
                    return
                }
            }
            expect(client.connection.getState()).toBe('disconnected')

            expect(received2).toEqual(received1)
        })

        it('should receive messages if publisher disconnects after each message', async () => {
            const otherClient = createClient({
                auth: client.options.auth,
            })

            client.enableAutoConnect()
            client.enableAutoDisconnect()

            const onConnected = jest.fn()
            const onDisconnected = jest.fn()
            const onConnectedOther = jest.fn()
            const onDisconnectedOther = jest.fn()
            otherClient.connection.on('connected', onConnectedOther)
            otherClient.connection.on('disconnected', onDisconnectedOther)
            client.connection.on('connected', onConnected)
            client.connection.on('disconnected', onDisconnected)

            try {
                await otherClient.connect()
                await otherClient.session.getSessionToken()

                const done = Defer()

                const msgs = []

                await otherClient.subscribe({
                    stream,
                    resend: {
                        last: 5
                    }
                }, (msg) => {
                    msgs.push(msg)
                    if (msgs.length === MAX_MESSAGES) {
                        // should eventually get here
                        done.resolve()
                    }
                })

                const published = await publishTestMessages(MAX_MESSAGES, {
                    delay: 500,
                    waitForStorage: true,
                })

                await done

                expect(msgs).toEqual(published)

                // check disconnect/connect actually happened
                expect(onConnected).toHaveBeenCalledTimes(published.length)
                expect(onDisconnected).toHaveBeenCalledTimes(published.length)
                expect(onConnectedOther).toHaveBeenCalledTimes(1)
                expect(onDisconnectedOther).toHaveBeenCalledTimes(0)
            } finally {
                await Promise.all([
                    otherClient.disconnect(),
                    client.disconnect(),
                ])
            }
        }, 15000)
    })

    describe('autoConnect disabled', () => {
        beforeEach(async () => {
            await setupClient({
                autoConnect: false,
                autoDisconnect: false,
            })
            await client.connect()
        })

        it('should error subscribe if client disconnected', async () => {
            await client.disconnect()
            await expect(async () => {
                await subscriber.subscribe(stream.id)
            }).rejects.toThrow()
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toEqual([])
        })

        it('should reconnect subscriptions when connection disconnected before subscribed & reconnected', async () => {
            const subTask = subscriber.subscribe(stream.id)
            await true
            client.connection.socket.close()
            const published = await publishTestMessages(2)
            const sub = await subTask
            expect(client.getSubscriptions(stream.id)).toHaveLength(1)
            subs.push(sub)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === published.length) {
                    expect(received).toEqual(published)
                }
                break
            }
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toEqual([])
        })

        it('should re-subscribe when subscribed then reconnected + fill gaps', async () => {
            const sub = await subscriber.subscribe(stream.id)
            subs.push(sub)
            const published = await publishTestMessages(2)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === 2) {
                    expect(received).toEqual(published)
                    client.connection.socket.close()
                    // this will cause a gap fill
                    published.push(...(await publishTestMessages(2)))
                }

                if (received.length === 4) {
                    expect(received).toEqual(published)
                    break
                }
            }
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toEqual([])
        }, 30000)

        it('should end when subscribed then disconnected', async () => {
            const sub = await subscriber.subscribe(stream.id)
            subs.push(sub)
            const published = await publishTestMessages(2)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === 1) {
                    expect(received).toEqual(published.slice(0, 1))
                    client.disconnect() // should trigger break
                    // no await, should be immediate
                }
            }
            expect(received).toEqual(published.slice(0, 1))
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toEqual([])
        })

        it('should end when subscribed then disconnected then connected', async () => {
            const sub = await subscriber.subscribe(stream.id)
            expect(client.getSubscriptions(stream.id)).toHaveLength(1)
            subs.push(sub)

            await publishTestMessages(2)
            const received = []
            await client.disconnect()
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toHaveLength(0)
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
            }
            expect(received).toEqual([])
            client.connect() // no await, should be ok
            await wait(1000)
            const sub2 = await subscriber.subscribe(stream.id)
            subs.push(sub)
            const published2 = await publishTestMessages(2)
            const received2 = []
            expect(subscriber.count(stream.id)).toBe(1)
            expect(client.getSubscriptions(stream.id)).toHaveLength(1)
            for await (const msg of sub2) {
                received2.push(msg.getParsedContent())
                if (received2.length === 1) {
                    await client.disconnect()
                }
            }
            expect(received2).toEqual(published2.slice(0, 1))
            expect(subscriber.count(stream.id)).toBe(0)
            expect(client.getSubscriptions(stream.id)).toEqual([])
        })

        it('should just end subs when disconnected', async () => {
            await client.connect()
            const sub = await subscriber.subscribe(stream.id)
            subs.push(sub)
            await client.disconnect()
            expect(subscriber.count(stream.id)).toBe(0)
        })

        it('should resubscribe on unexpected disconnection', async () => {
            const otherClient = createClient({
                auth: client.options.auth,
            })

            try {
                await Promise.all([
                    client.connect(),
                    otherClient.connect(),
                    otherClient.session.getSessionToken(),
                ])

                const done = Defer()

                const msgs = []

                await otherClient.subscribe(stream, (msg) => {
                    msgs.push(msg)

                    if (msgs.length === MAX_MESSAGES) {
                        // should eventually get here
                        done.resolve()
                    }
                })

                const onConnectionMessage = jest.fn(() => {
                    // disconnect after every message
                    otherClient.connection.socket.close()
                })

                otherClient.connection.on(ControlMessage.TYPES.BroadcastMessage, onConnectionMessage)
                otherClient.connection.on(ControlMessage.TYPES.UnicastMessage, onConnectionMessage)

                const onConnected = jest.fn()
                const onDisconnected = jest.fn()
                otherClient.connection.on('connected', onConnected)
                otherClient.connection.on('disconnected', onDisconnected)

                const published = await publishTestMessages(MAX_MESSAGES, {
                    delay: 500,
                })

                await done
                // wait for final re-connection after final message
                await otherClient.connection.nextConnection()

                expect(msgs).toEqual(published)

                // check disconnect/connect actually happened
                expect(onConnectionMessage).toHaveBeenCalledTimes(published.length)
                expect(onConnected).toHaveBeenCalledTimes(published.length)
                expect(onDisconnected).toHaveBeenCalledTimes(published.length)
            } finally {
                await Promise.all([
                    otherClient.disconnect(),
                    client.disconnect(),
                ])
            }
        }, 20000)
    })
})
