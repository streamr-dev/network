import 'reflect-metadata'
import { collect } from '../../src/utils/iterators'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('client destroy', () => {

    it('subscribe pipeline ends', async () => {
        const environment = new FakeEnvironment()
        const subscriber = environment.createClient()
        const stream = await createTestStream(subscriber, module)
        const sub = await subscriber.subscribe(stream.id)        
        const onError: any = jest.fn()
        sub.on('error', onError)
        const outputPromise = collect(sub)
        await subscriber.destroy()
        expect(onError).toBeCalledTimes(0)
        expect(await outputPromise).toEqual([])
    })
})
