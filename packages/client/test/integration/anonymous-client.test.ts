import { fastPrivateKey } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { createFakeContainer, DEFAULT_CLIENT_OPTIONS } from '../test-utils/fake/fakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('anonymous client', () => {

    it('fails to publish', async () => {
        const dependencyContainer = createFakeContainer(undefined)
        const owner = new StreamrClient({
            auth: {
                privateKey: fastPrivateKey()
            },
            ...DEFAULT_CLIENT_OPTIONS
        }, dependencyContainer)
        const stream = await createTestStream(owner, module)

        const publisher = new StreamrClient(DEFAULT_CLIENT_OPTIONS, dependencyContainer)
        expect(() => publisher.publish(stream, { foo: 'bar' })).rejects.toThrow('not authenticated with private key')
    })
})