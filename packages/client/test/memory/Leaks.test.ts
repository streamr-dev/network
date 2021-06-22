import { wait } from 'streamr-test-utils'
import LeakDetector from 'jest-leak-detector'

import { fakePrivateKey, describeRepeats, getPublishTestMessages, snapshot, LeaksDetector } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import Subscription from '../../src/subscribe/Subscription'
import { counterId, Defer } from '../../src/utils'

import clientOptions from '../integration/config'

const MAX_MESSAGES = 5

describeRepeats('Leaks', () => {
    let leakDetector: LeakDetector | undefined
    afterEach(async () => {
        expect(leakDetector).toBeTruthy()
        if (!leakDetector) { return }
        const detector = leakDetector
        leakDetector = undefined
        await wait(1000)
        expect(await detector.isLeaking()).toBeFalsy()
    })

    describe('StreamrClient', () => {
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

        beforeEach(async () => {
            // eslint-disable-next-line require-atomic-updates
        })

        test('creating client', () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
        })

        test('connect + disconnect', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.disconnect()
        })

        test('connect + disconnect + session token', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.session.getSessionToken()
            await client.disconnect()
        })

        test('connect + disconnect + getAddress', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.session.getSessionToken()
            await client.getAddress()
            await client.disconnect()
        })

        describe('stream', () => {
            let client: StreamrClient | undefined

            beforeEach(async () => {
                client = createClient()
                leakDetector = new LeakDetector(client)
                await client.connect()
                await client.session.getSessionToken()
                snapshot()
            })

            afterEach(async () => {
                if (!client) { return }
                const c = client
                client = undefined
                await c.disconnect()
                snapshot()
            })

            test('create', async () => {
                if (!client) { return }

                await client.createStream({
                    id: `/${counterId('stream')}`,
                    requireSignedData: true,
                })
            })

            test('cached functions', async () => {
                if (!client) { return }

                const stream = await client.createStream({
                    id: `/${counterId('stream')}`,
                    requireSignedData: true,
                })
                await client.cached.getUserInfo()
                await client.cached.getUserId()
                const ethAddress = await client.getAddress()
                await client.cached.isStreamPublisher(stream.id, ethAddress)
                await client.cached.isStreamSubscriber(stream.id, ethAddress)
                await client.cached.getUserId()
                await client.disconnect()
            }, 15000)

            test('publish', async () => {
                if (!client) { return }

                const stream = await client.createStream({
                    id: `/${counterId('stream')}`,
                    requireSignedData: true,
                })
                const publishTestMessages = getPublishTestMessages(client, {
                    retainMessages: false,
                    stream
                })

                await publishTestMessages(5)
                await client.disconnect()
                await wait(3000)
            }, 15000)

            describe('publish + subscribe', () => {
                it('does not leak subscription', async () => {
                    if (!client) { return }

                    const stream = await client.createStream({
                        id: `/${counterId('stream')}`,
                        requireSignedData: true,
                    })
                    let sub: Subscription | undefined = await client.subscribe(stream)
                    if (!sub) { throw new Error('no sub') }
                    const subLeak = new LeakDetector(sub)
                    const publishTestMessages = getPublishTestMessages(client, {
                        retainMessages: false,
                        stream
                    })

                    await publishTestMessages(MAX_MESSAGES)
                    sub = undefined
                    await client.disconnect()
                    await wait(3000)
                    expect(await subLeak.isLeaking()).toBeFalsy()
                }, 15000)

                // wrap these in describe blocks so we can ensure sub etc are out of scope when checking for leaks
                // publishTestMessages with retain: false holds onto last message for waitForStorage checks
                describe('subscribe using async iterator', () => {
                    let subLeak: LeakDetector
                    let leaksDetector: LeaksDetector

                    beforeEach(async () => {
                        if (!client) { return }

                        leaksDetector = new LeaksDetector()
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}`,
                            requireSignedData: true,
                        })
                        const sub = await client.subscribe(stream)
                        subLeak = new LeakDetector(sub)
                        const publishTestMessages = getPublishTestMessages(client, {
                            retainMessages: false,
                            stream
                        })

                        await publishTestMessages(MAX_MESSAGES)
                        const received = []
                        for await (const msg of sub) {
                            received.push(msg)
                            leaksDetector.add('streamMessage', msg)
                            if (received.length === MAX_MESSAGES) {
                                break
                            }
                        }
                        await wait(1000)
                    }, 15000)

                    test('does not leak subscription or messages', async () => {
                        if (!client) { return }
                        expect(await subLeak.isLeaking()).toBeFalsy()
                        await leaksDetector.checkNoLeaks()
                    })
                })

                describe('subscribe using onMessage callback', () => {
                    let subLeak: LeakDetector
                    let leaksDetector: LeaksDetector

                    beforeEach(async () => {
                        if (!client) { return }

                        leaksDetector = new LeaksDetector()
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}`,
                            requireSignedData: true,
                        })

                        const publishTestMessages = getPublishTestMessages(client, {
                            retainMessages: false,
                            stream
                        })
                        const received: any[] = []
                        const sub = await client.subscribe(stream, (msg, streamMessage) => {
                            received.push(msg)
                            leaksDetector.add('messageContent', msg)
                            leaksDetector.add('streamMessage', streamMessage)
                            if (received.length === MAX_MESSAGES) {
                                sub.unsubscribe()
                            }
                        })

                        subLeak = new LeakDetector(sub)

                        await publishTestMessages(MAX_MESSAGES)
                        await wait(1000)
                    }, 15000)

                    test('does not leak subscription or messages', async () => {
                        if (!client) { return }
                        expect(await subLeak.isLeaking()).toBeFalsy()
                        await leaksDetector.checkNoLeaks()
                    })
                })

                describe('subscriptions can be collected before all subscriptions removed', () => {
                    let subLeak1: LeakDetector
                    let subLeak2: LeakDetector

                    beforeEach(async () => {
                        if (!client) { return }

                        // leaksDetector = new LeaksDetector()
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}`,
                            requireSignedData: true,
                        })

                        const publishTestMessages = getPublishTestMessages(client, {
                            retainMessages: false,
                            stream
                        })
                        const sub1Done = Defer()
                        const received1: any[] = []
                        const SOME_MESSAGES = Math.floor(MAX_MESSAGES / 2)
                        let sub1: Subscription | undefined = await client.subscribe(stream, async (msg) => {
                            received1.push(msg)
                            if (received1.length === SOME_MESSAGES) {
                                if (!sub1) { return }
                                await sub1.unsubscribe()
                                // unsub early
                                sub1Done.resolve(undefined)
                            }
                        })

                        subLeak1 = new LeakDetector(sub1)

                        const sub2Done = Defer()
                        const received2: any[] = []
                        const sub2 = await client.subscribe(stream, (msg) => {
                            received2.push(msg)
                            if (received2.length === MAX_MESSAGES) {
                                // don't unsubscribe yet, this shouldn't affect sub1 from being collected
                                sub2Done.resolve(undefined)
                            }
                        })
                        subLeak2 = new LeakDetector(sub2)

                        await publishTestMessages(MAX_MESSAGES)
                        await sub1Done
                        await sub2Done
                        // eslint-disable-next-line require-atomic-updates
                        sub1 = undefined
                        await wait(1000)
                        snapshot()
                        // sub1 should have been collected even though sub2 is still subscribed
                        expect(await subLeak1.isLeaking()).toBeFalsy()
                        expect(await subLeak2.isLeaking()).toBeTruthy()
                        expect(received1).toHaveLength(SOME_MESSAGES)
                        expect(received2).toHaveLength(MAX_MESSAGES)
                        await sub2.unsubscribe()
                        await wait(1000)
                    }, 15000)

                    test('does not leak subscription or messages', async () => {
                        if (!client) { return }
                        expect(await subLeak1.isLeaking()).toBeFalsy()
                        expect(await subLeak2.isLeaking()).toBeFalsy()
                    })
                })
            })
        })
    })
})
