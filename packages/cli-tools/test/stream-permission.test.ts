import { fetchPrivateKeyWithGas, randomEthereumAddress } from '@streamr/test-utils'
import 'jest-extended'
import { StreamPermission } from 'streamr-client'
import { KEYSERVER_PORT, createTestClient, runCommand } from './utils'

describe('permission', () => {

    it('grant and revoke', async () => {
        const privateKey = await fetchPrivateKeyWithGas(KEYSERVER_PORT)
        const client = createTestClient(privateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        const otherUser = randomEthereumAddress()
        const hasPermission = () => client.hasPermission({
            user: otherUser,
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
