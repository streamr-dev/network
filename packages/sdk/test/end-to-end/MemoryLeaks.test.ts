import 'reflect-metadata'
import { describeOnlyInNodeJs, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Defer, wait, merge, TheGraphClient } from '@streamr/utils'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { LeaksDetector } from '../test-utils/LeaksDetector'
import { StreamrClient } from '../../src/StreamrClient'
import { container as rootContainer, DependencyContainer } from 'tsyringe'
import { writeHeapSnapshot } from 'v8'
import { Subscription } from '../../src/subscribe/Subscription'
import { counterId, instanceId, createTheGraphClient } from '../../src/utils/utils'
import {
    createStrictConfig,
    ConfigInjectionToken,
    StrictStreamrClientConfig,
    StreamrClientConfig
} from '../../src/Config'
import { NetworkNodeFacade } from '../../src/NetworkNodeFacade'
import { StorageNodeRegistry } from '../../src/contracts/StorageNodeRegistry'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { Resends } from '../../src/subscribe/Resends'
import { Publisher } from '../../src/publish/Publisher'
import { Subscriber } from '../../src/subscribe/Subscriber'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { DestroySignal } from '../../src/DestroySignal'
import { MessageMetadata } from '../../src/Message'
import { AuthenticationInjectionToken, createAuthentication } from '../../src/Authentication'
import { StreamrClientEventEmitter } from '../../src/events'
import { config as CHAIN_CONFIG } from '@streamr/config'

const Dependencies = {
    NetworkNodeFacade,
    StorageNodeRegistry,
    StreamRegistry,
    Resends,
    Publisher,
    Subscriber,
    LocalGroupKeyStore,
    DestroySignal
}

/**
 * Write a heap snapshot file if WRITE_SNAPSHOTS env var is set.
 */
function snapshot(): string {
    if (!process.env.WRITE_SNAPSHOTS) {
        return ''
    }
    const value = writeHeapSnapshot()
    return value
}

const MAX_MESSAGES = 5
const TIMEOUT = 30000

describeOnlyInNodeJs('MemoryLeaks', () => {
    // LeaksDetector is not supported in Electron
    let leaksDetector: LeaksDetector

    beforeEach(() => {
        leaksDetector = new LeaksDetector()
        leaksDetector.ignoreAll(rootContainer)
        leaksDetector.ignoreAll(CHAIN_CONFIG)
        snapshot()
    })

    afterEach(async () => {
        expect(leaksDetector).toBeTruthy()
        if (!leaksDetector) {
            return
        }
        const detector = leaksDetector
        await wait(5000)
        snapshot()
        await detector.checkNoLeaks() // this is very slow
        detector.clear()
    }, TIMEOUT)

    describe('client container', () => {
        let createContainer: (opts?: any) => Promise<any>
        beforeAll(() => {
            createContainer = async (
                opts: any = {}
            ): Promise<{
                config: StrictStreamrClientConfig
                childContainer: DependencyContainer
            }> => {
                const config = createStrictConfig(
                    merge<StreamrClientConfig>(
                        {
                            environment: 'dev2',
                            auth: {
                                privateKey: await fetchPrivateKeyWithGas()
                            }
                        },
                        opts
                    )
                )
                const childContainer = rootContainer.createChildContainer()
                childContainer.register(AuthenticationInjectionToken, { useValue: createAuthentication(config) })
                childContainer.register(ConfigInjectionToken, { useValue: config })
                childContainer.register(TheGraphClient, {
                    useValue: createTheGraphClient(
                        childContainer.resolve<StreamrClientEventEmitter>(StreamrClientEventEmitter),
                        config
                    )
                })
                return { config, childContainer }
            }
        })

        test('container get all', async () => {
            const { config, childContainer } = await createContainer()
            const toStop = []
            const destroySignal = childContainer.resolve(Dependencies.DestroySignal)
            for (const [key, value] of Object.entries(Dependencies)) {
                const result = childContainer.resolve(value as any)
                expect(result).toBeTruthy()

                if (result && typeof result.stop === 'function') {
                    toStop.push(result)
                }
                leaksDetector.addAll(key, result)
            }
            await wait(100)
            leaksDetector.addAll('id', { config, childContainer })
            await destroySignal.trigger()
            for (const result of toStop) {
                await result.stop()
            }
            childContainer.clearInstances()
        })
    })

    describe('StreamrClient', () => {
        let createClient: () => Promise<StreamrClient>
        beforeAll(() => {
            createClient = async (opts: any = {}) => {
                const c = new StreamrClient(
                    merge<StreamrClientConfig>(
                        {
                            environment: 'dev2',
                            auth: {
                                privateKey: await fetchPrivateKeyWithGas()
                            }
                        },
                        opts
                    )
                )
                return c
            }
        })

        describe('with client', () => {
            test('creating client', async () => {
                const client = await createClient()
                leaksDetector.addAll(instanceId(client), client)
            })

            test('connect + destroy', async () => {
                const client = await createClient()
                await client.connect()
                await client.destroy()
                leaksDetector.addAll(instanceId(client), client)
            })
        })

        describe('stream', () => {
            let client: StreamrClient

            beforeEach(async () => {
                client = await createClient()
                leaksDetector.addAll(instanceId(client), client)
                await client.connect()
            })

            afterEach(async () => {
                const c = client
                // @ts-expect-error doesn't want us to unassign but it's ok
                client = undefined // unassign so can gc
                await c.destroy()
            })

            test('create', async () => {
                await client.createStream({
                    id: `/${counterId('stream')}-${Date.now()}`
                })
            })

            test(
                'publish',
                async () => {
                    const stream = await client.createStream({
                        id: `/${counterId('stream')}-${Date.now()}`
                    })
                    const publishTestMessages = getPublishTestStreamMessages(client, stream, {
                        retainMessages: false
                    })

                    await publishTestMessages(5)
                    await client.destroy()
                    leaksDetector.add('stream', stream)
                    await wait(3000)
                },
                TIMEOUT
            )

            describe('publish + subscribe', () => {
                it(
                    'does not leak subscription',
                    async () => {
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}-${Date.now()}`
                        })
                        const sub = await client.subscribe(stream)
                        leaksDetector.addAll(instanceId(sub), sub)
                        const publishTestMessages = getPublishTestStreamMessages(client, stream, {
                            retainMessages: false
                        })

                        await publishTestMessages(MAX_MESSAGES)
                    },
                    TIMEOUT
                )

                test(
                    'subscribe using async iterator',
                    async () => {
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}-${Date.now()}`
                        })
                        const sub = await client.subscribe(stream)
                        leaksDetector.addAll(instanceId(sub), sub)
                        const publishTestMessages = getPublishTestStreamMessages(client, stream, {
                            retainMessages: false
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
                    },
                    TIMEOUT
                )

                test(
                    'subscribe using onMessage callback',
                    async () => {
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}-${Date.now()}`
                        })

                        const publishTestMessages = getPublishTestStreamMessages(client, stream, {
                            retainMessages: false
                        })
                        const received: MessageMetadata[] = []
                        const sub = await client.subscribe(stream, (content: any, metadata: MessageMetadata) => {
                            received.push(metadata)
                            leaksDetector.add('content', content)
                            leaksDetector.add('metadata', metadata)
                            if (received.length === MAX_MESSAGES) {
                                sub.unsubscribe()
                            }
                        })

                        leaksDetector.add(instanceId(sub), sub)

                        await publishTestMessages(MAX_MESSAGES)
                        await wait(1000)
                    },
                    TIMEOUT
                )

                test(
                    'subscriptions can be collected before all subscriptions removed',
                    async () => {
                        const stream = await client.createStream({
                            id: `/${counterId('stream')}-${Date.now()}`
                        })

                        const publishTestMessages = getPublishTestStreamMessages(client, stream, {
                            retainMessages: false
                        })
                        const sub1Done = new Defer<undefined>()
                        const received1: any[] = []
                        const SOME_MESSAGES = Math.floor(MAX_MESSAGES / 2)
                        let sub1: Subscription | undefined = await client.subscribe(stream, async (msg: any) => {
                            received1.push(msg)
                            if (received1.length === SOME_MESSAGES) {
                                if (!sub1) {
                                    return
                                }
                                sub1.unsubscribe()
                                // unsub early
                                sub1Done.resolve(undefined)
                            }
                        })
                        const sub1LeakId = 'sub1 ' + instanceId(sub1)
                        leaksDetector.add(sub1LeakId, sub1)

                        const sub2Done = new Defer<undefined>()
                        const received2: any[] = []
                        const sub2 = await client.subscribe(stream, (msg: any) => {
                            received2.push(msg)
                            if (received2.length === MAX_MESSAGES) {
                                // don't unsubscribe yet, this shouldn't affect sub1 from being collected
                                sub2Done.resolve(undefined)
                            }
                        })
                        leaksDetector.add('sub2 ' + instanceId(sub2), sub2)

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
                    },
                    TIMEOUT
                )
            })
        })
    })
})
