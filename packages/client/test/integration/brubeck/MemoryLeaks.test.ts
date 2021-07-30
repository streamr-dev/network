import { wait } from 'streamr-test-utils'
import { fakePrivateKey, describeRepeats, snapshot, LeaksDetector } from '../../utils'
import { getPublishTestMessages } from './utils'
import { BrubeckClient } from '../../../src/brubeck/BrubeckClient'
import Subscription from '../../../src/brubeck/Subscription'
import { counterId, Defer } from '../../../src/utils'

import clientOptions from '../config'

const MAX_MESSAGES = 5

describeRepeats('Leaks', () => {
    let leaksDetector: LeaksDetector

    beforeEach(() => {
        leaksDetector = new LeaksDetector()
    })

    afterEach(async () => {
        expect(leaksDetector).toBeTruthy()
        if (!leaksDetector) { return }
        const detector = leaksDetector
        await wait(1000)
        await detector.checkNoLeaks()
    })

    describe('BrubeckClient', () => {
        const createClient = (opts: any = {}) => {
            const c = new BrubeckClient({
                ...clientOptions,
                auth: {
                    privateKey: fakePrivateKey(),
                },
                autoConnect: false,
                autoDisconnect: false,
                maxRetries: 2,
                ...opts,
            })
            return c
        }

        describe('with client', () => {
            test('creating client', () => {
                const client = createClient()
                leaksDetector.addAll(client.id, client)
            })

            test('connect + disconnect', async () => {
                const client = createClient()
                leaksDetector.addAll(client.id, client)
                await client.connect()
                await client.disconnect()
            })

            test('connect + disconnect + session token', async () => {
                const client = createClient()
                leaksDetector.addAll(client.id, client)
                await client.connect()
                await client.getSessionToken()
                await client.disconnect()
            })

            test('connect + disconnect + getAddress', async () => {
                const client = createClient()
                leaksDetector.addAll(client.id, client)
                await client.connect()
                await client.getSessionToken()
                await client.getAddress()
                await client.disconnect()
            })
        })

        describe('stream', () => {
            let client: BrubeckClient

            beforeEach(async () => {
                client = createClient()
                leaksDetector.addAll(client.id, client)
                await client.connect()
                await client.getSessionToken()
                snapshot()
            })

            afterEach(async () => {
                const c = client
                // @ts-expect-error doesn't want us to unassign but it's ok
                client = undefined // unassign so can gc
                await c.disconnect()
                snapshot()
            })

            test('create', async () => {
                await client.createStream({
                    id: `/${counterId('stream')}`,
                    requireSignedData: true,
                })
            })

            test('publish', async () => {
                const stream = await client.createStream({
                    id: `/${counterId('stream')}`,
                    requireSignedData: true,
                })
                const publishTestMessages = getPublishTestMessages(client, stream, {
                    retainMessages: false,
                })

                await publishTestMessages(5)
                await client.disconnect()
                leaksDetector.add('stream', stream)
                await wait(3000)
            }, 15000)

            describe('publish + subscribe', () => {
                it('does not leak subscription', async () => {
                    const stream = await client.createStream({
                        id: `/${counterId('stream')}`,
                        requireSignedData: true,
                    })
                    const sub = await client.subscribe(stream)
                    leaksDetector.addAll(sub.id, sub)
                    const publishTestMessages = getPublishTestMessages(client, stream, {
                        retainMessages: false,
                    })

                    await publishTestMessages(MAX_MESSAGES)
                }, 15000)

                test('subscribe using async iterator', async () => {
                    const stream = await client.createStream({
                        id: `/${counterId('stream')}`,
                        requireSignedData: true,
                    })
                    const sub = await client.subscribe(stream)
                    leaksDetector.addAll(sub.id, sub)
                    const publishTestMessages = getPublishTestMessages(client, stream, {
                        retainMessages: false,
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
                }, 15000)

                test('subscribe using onMessage callback', async () => {
                    const stream = await client.createStream({
                        id: `/${counterId('stream')}`,
                        requireSignedData: true,
                    })

                    const publishTestMessages = getPublishTestMessages(client, stream, {
                        retainMessages: false,
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

                    leaksDetector.add(sub.id, sub)

                    await publishTestMessages(MAX_MESSAGES)
                    await wait(1000)
                }, 15000)

                test('subscriptions can be collected before all subscriptions removed', async () => {
                    // leaksDetector = new LeaksDetector()
                    const stream = await client.createStream({
                        id: `/${counterId('stream')}`,
                        requireSignedData: true,
                    })

                    const publishTestMessages = getPublishTestMessages(client, stream, {
                        retainMessages: false,
                    })
                    const sub1Done = Defer()
                    const received1: any[] = []
                    const SOME_MESSAGES = Math.floor(MAX_MESSAGES / 2)
                    let sub1: Subscription<any> | undefined = await client.subscribe(stream, async (msg) => {
                        received1.push(msg)
                        if (received1.length === SOME_MESSAGES) {
                            if (!sub1) { return }
                            await sub1.unsubscribe()
                            // unsub early
                            sub1Done.resolve(undefined)
                        }
                    })

                    const sub1LeakId = 'sub1 ' + sub1.id
                    leaksDetector.add(sub1LeakId, sub1)

                    const sub2Done = Defer()
                    const received2: any[] = []
                    const sub2 = await client.subscribe(stream, (msg) => {
                        received2.push(msg)
                        if (received2.length === MAX_MESSAGES) {
                            // don't unsubscribe yet, this shouldn't affect sub1 from being collected
                            sub2Done.resolve(undefined)
                        }
                    })
                    leaksDetector.add('sub2 ' + sub2.id, sub2)

                    await publishTestMessages(MAX_MESSAGES)
                    await sub1Done
                    await sub2Done
                    // eslint-disable-next-line require-atomic-updates
                    sub1 = undefined
                    await wait(1000)
                    snapshot()
                    // sub1 should have been collected even though sub2 is still subscribed
                    await leaksDetector.checkNoLeaksFor(sub1LeakId)
                    expect(received1).toHaveLength(SOME_MESSAGES)
                    expect(received2).toHaveLength(MAX_MESSAGES)
                    await sub2.unsubscribe()
                    await wait(1000)
                }, 15000)
            })
        })
    })
})
