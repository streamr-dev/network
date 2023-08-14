import { fastPrivateKey } from '@streamr/test-utils'
import { CONFIG_TEST, StreamrClient } from '../../src'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
            id: expect.stringMatching(UUID_REGEX),
            type: 'nodejs',
        })
    }, 30 * 1000)
})
