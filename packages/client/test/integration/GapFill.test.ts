import 'reflect-metadata'

import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { StreamrClientConfig } from '../../src/Config'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'
import { merge } from '@streamr/utils'

const MAX_MESSAGES = 10

function monkeypatchMessageHandler(
    streamPartId: StreamPartID,
    client: StreamrClient,
    fn: ((msg: StreamMessage, count: number) => undefined | null)
) {
    let count = 0
    // @ts-expect-error private
    const subSession = client.subscriber.getSubscriptionSession(streamPartId)!
    // @ts-expect-error private
    subSession.pipeline.pipeBefore(async function* DropMessages(src: AsyncGenerator<any>) {
        for await (const msg of src) {
            const result = fn(msg, count)
            count += 1
            if (result === null) {
                continue
            }
            yield msg
        }
    })
}

describe('GapFill', () => {
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let client: StreamrClient
    let stream: Stream
    let storageNode: FakeStorageNode
    let environment: FakeEnvironment

    async function setupClient(opts: StreamrClientConfig) {
        client = environment.createClient(
            merge(
                {
                    maxGapRequests: 2,
                    gapFillTimeout: 500,
                    retryResendAfter: 1000
                },
                opts
            )
        )
        stream = await createTestStream(client, module)
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        await stream.addToStorageNode(storageNode.id)
        publishTestMessages = getPublishTestStreamMessages(client, stream.id, { waitForLast: true })
    }

    beforeEach(async () => {
        environment = new FakeEnvironment()
        storageNode = environment.startStorageNode()
    })

    afterEach(async () => {
        const subscriptions = await client.getSubscriptions()
        expect(subscriptions).toHaveLength(0)
    })

    describe('filling gaps', () => {
        beforeEach(async () => {
            await setupClient({
                gapFillTimeout: 200,
                retryResendAfter: 200,
            })
        })

        describe('realtime (uses resend)', () => {
            it('can fill single gap', async () => {
                // @ts-expect-error private
                const calledResend = jest.spyOn(client.resends, 'range')
                const sub = await client.subscribe(stream.id)
                monkeypatchMessageHandler(sub.streamPartId, client, (_msg, count) => {
                    if (count === 2) {
                        return null
                    }
                    return undefined
                })

                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                const published = await publishTestMessages(MAX_MESSAGES)

                const received = []
                for await (const m of sub) {
                    received.push(m)
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
                // might be > 1, depends whether messages in storage by time gap is requested.
                // message pipeline is processed as soon as messages arrive,
                // not when sub starts iterating
                expect(calledResend).toHaveBeenCalled()
            })

            it('can fill gap of multiple messages', async () => {
                const sub = await client.subscribe(stream.id)
                monkeypatchMessageHandler(sub.streamPartId, client, (_msg, count) => {
                    if (count > 1 && count < 4) { return null }
                    return undefined
                })

                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                const published = await publishTestMessages(MAX_MESSAGES)

                const received = []
                for await (const m of sub) {
                    received.push(m)
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can fill multiple gaps', async () => {
                const sub = await client.subscribe(stream.id)

                monkeypatchMessageHandler(sub.streamPartId, client, (_msg, count) => {
                    if (count === 3 || count === 4 || count === 7) { return null }
                    return undefined
                })

                expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

                const published = await publishTestMessages(MAX_MESSAGES)

                const received = []
                for await (const m of sub) {
                    received.push(m)
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })
        })

        describe('resend', () => {
            it('can fill gaps', async () => {
                let count = 0
                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                })

                const sub = await client.resend(
                    stream.id,
                    {
                        last: MAX_MESSAGES
                    }
                )

                sub.pipeBefore(async function* DropMessages(src) {
                    for await (const msg of src) {
                        count += 1
                        if (count === 3 || count === 4 || count === 7) {
                            continue
                        }
                        yield msg
                    }
                })

                const received = []
                for await (const m of sub) {
                    received.push(m)
                    // should not need to explicitly end
                }
                expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
            })

            it('can fill gaps in resends even if gap cannot be filled (ignores missing)', async () => {
                let ts = 0
                const node = await client.getNode()
                let publishCount = 1000
                const publish = node.publish.bind(node)
                node.publish = (msg) => {
                    publishCount += 1
                    if (publishCount === 1003) {
                        return undefined
                    }

                    return publish(msg)
                }

                const published = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                    timestamp: () => {
                        const v = 1000000 + ts
                        ts += 1
                        return v
                    }
                })

                const sub = await client.resend(
                    stream.id,
                    {
                        last: MAX_MESSAGES
                    }
                )

                const received = []
                for await (const m of sub) {
                    received.push(m)
                    // should not need to explicitly end
                }
                const expected = published.filter((_value: any, index: number) => index !== 2).map((m) => m.signature)
                expect(received.map((m) => m.signature)).toEqual(expected)
            }, 20000)
        })
    })

    describe('client settings', () => {
        it('ignores gaps if orderMessages disabled', async () => {
            await setupClient({
                orderMessages: false, // should disable all gapfilling
                gapFillTimeout: 200,
                retryResendAfter: 1000,
                maxGapRequests: 99 // would time out test if doesn't give up
            })

            // @ts-expect-error private
            const calledResend = jest.spyOn(client.resends, 'range')

            const node = await client.getNode()
            let publishCount = 0
            const publish = node.publish.bind(node)
            node.publish = (msg) => {
                publishCount += 1
                if (publishCount === 3) {
                    return undefined
                }

                return publish(msg)
            }

            const sub = await client.subscribe({
                id: stream.id
            })

            const publishedTask = publishTestMessages(MAX_MESSAGES)

            const received: any[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_MESSAGES - 1) {
                    break
                }
            }
            const published = await publishedTask
            expect(received.map((m) => m.signature)).toEqual(published.filter((_value: any, index: number) => index !== 2).map((m) => m.signature))
            expect(calledResend).toHaveBeenCalledTimes(0)
        })

        it('calls gapfill max maxGapRequests times', async () => {
            await setupClient({
                gapFillTimeout: 200,
                retryResendAfter: 200,
                maxGapRequests: 3
            })

            // @ts-expect-error private
            const calledResend = jest.spyOn(client.resends, 'range')
            const node = await client.getNode()
            let publishCount = 0
            const publish = node.publish.bind(node)
            node.publish = (msg) => {
                publishCount += 1
                if (publishCount === 3) {
                    return undefined
                }

                return publish(msg)
            }

            const published = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: true,
            })

            const sub = await client.resend(
                stream.id,
                {
                    last: MAX_MESSAGES
                }
            )

            const received: any[] = []
            for await (const m of sub) {
                received.push(m)
                if (received.length === MAX_MESSAGES - 1) {
                    break
                }
            }
            expect(received.map((m) => m.signature)).toEqual(published.filter((_value: any, index: number) => index !== 2).map((m) => m.signature))
            expect(calledResend).toHaveBeenCalledTimes(2 * 3) // another 3 come from resend done in publishTestMessages
        })
    })
})
