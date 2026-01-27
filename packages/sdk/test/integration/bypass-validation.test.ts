import { StreamPartIDUtils } from '@streamr/utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { nextValue } from '../../src/utils/iterators'

describe('bypass validation', () => {

    it('happy path', async () => {
        const environment = new FakeEnvironment()
        const config = {
            validation: {
                permissions: false,
                partitions: false
            }
        }
        const publisher = environment.createClient(config)
        const subscriber = environment.createClient(config)
        const streamPartId = StreamPartIDUtils.parse('test.eth/foo/bar#4')
        const subscription = await subscriber.subscribe(streamPartId)
        await publisher.publish(streamPartId, {
            message: 'hello'
        })
        const message = await nextValue(subscription[Symbol.asyncIterator]())
        expect(message!.content).toEqual({
            message: 'hello'
        })
        await environment.destroy()
    })
})
