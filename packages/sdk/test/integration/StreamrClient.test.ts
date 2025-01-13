import 'reflect-metadata'

import { fastPrivateKey, fastWallet } from '@streamr/test-utils'
import { Defer, StreamPartID, StreamPartIDUtils, collect, wait } from '@streamr/utils'
import { MessageMetadata } from '../../src/Message'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { Msg, getPublishTestStreamMessages } from '../test-utils/publish'
import { createTestStream, readUtf8ExampleIndirectly } from '../test-utils/utils'

// TODO rename this test to something more specific (and maybe divide to multiple test files?)

const MAX_MESSAGES = 10
const TIMEOUT = 30 * 1000
const WAIT_TIME = 600

describe('StreamrClient', () => {
    let client: StreamrClient
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let streamDefinition: StreamPartID
    let privateKey: string
    let environment: FakeEnvironment

    beforeEach(async () => {
        privateKey = fastPrivateKey()
        environment = new FakeEnvironment()
        client = environment.createClient({
            auth: {
                privateKey
            }
        })
        const stream = await createTestStream(client, module)
        streamDefinition = (await stream.getStreamParts())[0]
        const publisherWallet = fastWallet()
        await stream.grantPermissions({
            userId: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        publishTestMessages = getPublishTestStreamMessages(
            environment.createClient({
                auth: {
                    privateKey: publisherWallet.privateKey
                }
            }),
            streamDefinition
        )
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('Pub/Sub', () => {
        it(
            'client.publish does not error',
            async () => {
                await client.publish(streamDefinition, {
                    test: 'client.publish'
                })
                await wait(WAIT_TIME)
            },
            TIMEOUT
        )

        it(
            'Stream.publish does not error',
            async () => {
                const stream = await client.getStream(StreamPartIDUtils.getStreamID(streamDefinition))
                await stream.publish({
                    test: 'Stream.publish'
                })
                await wait(WAIT_TIME)
            },
            TIMEOUT
        )

        it(
            'client.publish with Stream object as arg',
            async () => {
                const stream = await client.getStream(StreamPartIDUtils.getStreamID(streamDefinition))
                await client.publish(stream, {
                    test: 'client.publish.Stream.object'
                })
                await wait(WAIT_TIME)
            },
            TIMEOUT
        )

        it('client.subscribe (realtime) with onMessage callback', async () => {
            const done = new Defer<void>()
            const mockMessage = Msg()
            await client.subscribe(
                streamDefinition,
                done.wrap(async (content, metadata) => {
                    expect(content).toEqual(mockMessage)
                    expect(metadata.publisherId).toBeTruthy()
                    expect(metadata.signature).toBeTruthy()
                })
            )

            // Publish after subscribed
            await client.publish(streamDefinition, mockMessage)
            await done
        })

        it('client.subscribe with onMessage & collect', async () => {
            const onMessageMsgs: MessageMetadata[] = []
            const done = new Defer<undefined>()
            const sub = await client.subscribe(streamDefinition, async (_content, metadata) => {
                onMessageMsgs.push(metadata)
                if (onMessageMsgs.length === MAX_MESSAGES) {
                    done.resolve(undefined)
                }
            })

            const published = await publishTestMessages(MAX_MESSAGES)
            await expect(async () => collect(sub, 1)).rejects.toThrow()
            await done
            expect(onMessageMsgs.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })

        it('client.subscribe with onMessage callback that throws', async () => {
            const onMessageMsgs: MessageMetadata[] = []
            const err = new Error('expected error')
            const sub = await client.subscribe(streamDefinition, async (_content, metadata) => {
                onMessageMsgs.push(metadata)
                if (onMessageMsgs.length === MAX_MESSAGES) {
                    sub.return()
                }
                throw err
            })

            const onSubError = jest.fn()
            sub.onError.listen(onSubError)

            const published = await publishTestMessages(MAX_MESSAGES)
            await sub.onFinally.listen()
            expect(onMessageMsgs.map((m) => m.signature)).toEqual(published.slice(0, 1).map((m) => m.signature))
            expect(onSubError).toHaveBeenCalledTimes(1)
            expect(onSubError).toHaveBeenCalledWith(err)
        })

        it('publish and subscribe a sequence of messages', async () => {
            const done = new Defer<unknown>()
            const received: MessageMetadata[] = []
            const sub = await client.subscribe(streamDefinition, (_content, metadata) => {
                received.push(metadata)
                expect(metadata.publisherId).toBeTruthy()
                expect(metadata.signature).toBeTruthy()
                if (received.length === MAX_MESSAGES) {
                    done.resolve(client.unsubscribe(sub))
                }
            })

            // Publish after subscribed
            const published = await publishTestMessages(MAX_MESSAGES)

            await done
            expect(received.map((m) => m.signature)).toEqual(published.map((m) => m.signature))
        })
    })

    describe('utf-8 encoding', () => {
        it('decodes realtime messages correctly', async () => {
            const content = await readUtf8ExampleIndirectly()
            const publishedMessage = Msg({ content })
            const sub = await client.subscribe(streamDefinition)
            await client.publish(streamDefinition, publishedMessage)
            const messages = await collect(sub, 1)
            expect(messages.map((s) => s.content)).toEqual([publishedMessage])
        })
    })
})
