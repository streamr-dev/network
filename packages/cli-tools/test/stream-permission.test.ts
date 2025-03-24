import { StreamPermission } from '@streamr/sdk'
import { createTestPrivateKey, randomUserId } from '@streamr/test-utils'
import 'jest-extended'
import { createTestClient, runCommand } from './utils'

describe('permission', () => {

    it('grant and revoke', async () => {
        const privateKey = await createTestPrivateKey({ gas: true })
        const client = createTestClient(privateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        const otherUser = randomUserId()
        const hasPermission = () => client.hasPermission({
            userId: otherUser,
            permission: StreamPermission.PUBLISH,
            streamId: stream.id,
            allowPublic: false
        })
        await runCommand(`stream grant-permission ${stream.id} ${otherUser} publish`, {
            privateKey
        })
        expect(await hasPermission()).toBeTrue()
        await runCommand(`stream revoke-permission ${stream.id} ${otherUser} publish`, {
            privateKey
        })
        expect(await hasPermission()).toBeFalse()
        await client.destroy()
    }, 40 * 1000)
})
