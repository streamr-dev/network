import 'reflect-metadata'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('anonymous client', () => {

    it('fails to publish', async () => {
        const environment = new FakeEnvironment()
        const owner = environment.createClient()
        const stream = await createTestStream(owner, module)

        const publisher = environment.createClient({
            auth: {
                unauthenticated: true
            }
        })
        await expect(() => publisher.publish(stream, { foo: 'bar' })).rejects.toThrow('not authenticated with private key')
    })
})
