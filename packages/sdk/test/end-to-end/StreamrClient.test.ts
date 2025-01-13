import { fastPrivateKey, isRunningInElectron } from '@streamr/test-utils'
import { StreamrClient } from '../../src'

describe('StreamrClient', () => {
    let client: StreamrClient

    beforeEach(async () => {
        client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey: fastPrivateKey()
            }
        })
    }, 30 * 1000)

    afterEach(async () => {
        await client.destroy()
    })

    it(
        'getPeerDescriptor',
        async () => {
            const descriptor = await client.getPeerDescriptor()
            expect(descriptor).toMatchObject({
                nodeId: expect.toBeString(),
                type: isRunningInElectron() ? 'browser' : 'nodejs'
            })
            expect(descriptor.nodeId).toEqual(await client.getNodeId())
        },
        30 * 1000
    )
})
