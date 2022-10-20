import { createTestStream } from './../test-utils/utils'
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamrClient } from './../../src/StreamrClient'

describe('unsubscribe', () => {

    let environment: FakeEnvironment
    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
    })

    describe('Realtime subscription', () => {

        describe('StreamrClient#unsubscribe', () => {

            it('unsubscribe after subscribed', async () => {
                const subTask = client.subscribe(stream.id, () => {})
                expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

                const sub = await subTask

                expect(await client.getSubscriptions()).toHaveLength(1)
                await client.unsubscribe(sub)
                expect(await client.getSubscriptions()).toHaveLength(0)
            })

            it('unsubscribe before subscribed', async () => {
                const subTask = client.subscribe(stream.id, () => {})
                expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

                const unsubTask = client.unsubscribe(stream.id)

                expect(await client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                await unsubTask
                await subTask
            })
        })

        it('Subscription#unsubscribe', async () => {
            const sub = await client.subscribe(stream.id, () => {})
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(1)
            await sub.unsubscribe()
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(0)
        })
    })

    describe('Resend request', () => {

        beforeEach(() => {
            const storageNode = environment.startStorageNode()
            client.addStreamToStorageNode(stream.id, storageNode.id)
        })

        it('Client#unsubscribe', async () => {
            await client.resend(stream.id, { last: 1 }, () => {})
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(1)
            await client.unsubscribe(stream.id)
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(0)
        })

        it('Subscription#unsubscribe', async () => {
            const sub = await client.resend(stream.id, { last: 1 }, () => {})
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(1)
            await sub.unsubscribe()
            expect(await client.getSubscriptions({
                streamId: stream.id
            })).toHaveLength(0)
        })
    })
})
