import { fastPrivateKey } from '@streamr/test-utils'
import { CONFIG_TEST, StreamrClient } from '../../src'

describe('StreamrClient', () => {
    let client: StreamrClient

    beforeEach(async () => {
        client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: fastPrivateKey(),
            }
        })
    }, 30 * 1000)

    afterEach(async () => {
        await client.destroy()
    })

    it('getPeerDescriptor', async () => {
        await client.subscribe('foobar')
        const descriptor = await client.getPeerDescriptor()
        expect(descriptor).toMatchObject({
            id: expect.stringMatching(/^[0-9A-Fa-f]+$/),
            type: 'nodejs',
        })
    }, 30 * 1000)
})
