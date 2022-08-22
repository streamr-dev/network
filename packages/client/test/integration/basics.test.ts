import { createTestStream } from './../test-utils/utils'
import { Msg, publishTestMessagesGenerator } from '../test-utils/publish'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src'
import { collect } from '../../src/utils/GeneratorUtils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

describe('Basics', () => {
    const MAX_MESSAGES = 10
    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
    })

    afterEach(async () => {
        await client?.destroy()
    })

    describe('Pub/Sub', () => {
        it('can successfully pub/sub 1 message', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await client.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('can successfully pub/sub multiple messages', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const publish = publishTestMessagesGenerator(client, stream, MAX_MESSAGES, { timestamp: 1111111 })
            const published = await collect(publish, MAX_MESSAGES)
            const received = []
            for await (const msg of sub) {
                received.push(msg)
                if (received.length === published.length) {
                    break
                }
            }

            expect(received.map((s) => s.getParsedContent())).toEqual(published.map((s) => s.getParsedContent()))
            expect(received.map((streamMessage) => streamMessage.getTimestamp())).toEqual(published.map(() => 1111111))
        })

        it('can successfully pub/sub multiple streams', async () => {
            async function testPubSub(testStream: Stream) {
                const sub = await client.subscribe({
                    streamId: testStream.id,
                })
                const publish = publishTestMessagesGenerator(client, testStream, MAX_MESSAGES, { timestamp: 1111111 })
                const published = await collect(publish, MAX_MESSAGES)
                const received = []
                for await (const msg of sub) {
                    received.push(msg)
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received.map((s) => s.getParsedContent())).toEqual(published.map((s) => s.getParsedContent()))
                return expect(received.map((streamMessage) => streamMessage.getTimestamp())).toEqual(published.map(() => 1111111))
            }
            const stream2 = await createTestStream(client, module)
            await stream2.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

            const tasks = [
                testPubSub(stream),
                testPubSub(stream2),
            ]
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        })
    })
})
