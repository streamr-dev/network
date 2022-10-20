import { createTestStream } from './../test-utils/utils';
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamrClient } from './../../src/StreamrClient'

describe('unsubscribe', () => {

    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
    })

    it('client.subscribe then unsubscribe after subscribed', async () => {
        const subTask = client.subscribe(stream.id, () => {})
        expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

        const sub = await subTask

        expect(await client.getSubscriptions()).toHaveLength(1)
        await client.unsubscribe(sub)
        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('client.subscribe then unsubscribe before subscribed', async () => {
        const subTask = client.subscribe(stream.id, () => {})
        expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

        const unsubTask = client.unsubscribe(stream.id)

        expect(await client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
        await unsubTask
        await subTask
    })
})