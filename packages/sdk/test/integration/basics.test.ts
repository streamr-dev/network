import 'reflect-metadata'

import { collect } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { Msg, publishTestMessagesGenerator } from '../test-utils/publish'
import { createTestStream } from './../test-utils/utils'

describe('Basics', () => {
    const MAX_MESSAGES = 10
    let client: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('Pub/Sub', () => {
        it('can successfully pub/sub 1 message', async () => {
            const sub = await client.subscribe({
                streamId: stream.id
            })
            const testMsg = Msg()
            await client.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('can successfully pub/sub multiple messages', async () => {
            const sub = await client.subscribe({
                streamId: stream.id
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

            expect(received.map((s) => s.content)).toEqual(published.map((s) => s.content))
            expect(received.map((streamMessage) => streamMessage.timestamp)).toEqual(published.map(() => 1111111))
        })

        it('can successfully pub/sub multiple streams', async () => {
            async function testPubSub(testStream: Stream) {
                const sub = await client.subscribe({
                    streamId: testStream.id
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
                expect(received.map((s) => s.content)).toEqual(published.map((s) => s.content))
                expect(received.map((streamMessage) => streamMessage.timestamp)).toEqual(published.map(() => 1111111))
            }
            const stream2 = await createTestStream(client, module)
            await stream2.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

            const tasks = [testPubSub(stream), testPubSub(stream2)]
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        })
    })
})
