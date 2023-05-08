import 'reflect-metadata'

import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

describe('events', () => {
    describe('emit', () => {
        it('publish', async () => {
            const environment = new FakeEnvironment()
            const client = environment.createClient()
            const onEmit = jest.fn()
            // @ts-expect-error internal event
            client.on('publish', onEmit)
            const stream = await client.createStream('/test')
            await client.publish(stream.id, {})
            await stream.publish({})
            expect(onEmit).toBeCalledTimes(2)
        })
    })
})
