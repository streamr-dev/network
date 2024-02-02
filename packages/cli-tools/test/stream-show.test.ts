import { Wallet } from '@ethersproject/wallet'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { KEYSERVER_PORT, createTestClient, runCommand, waitForTheGraphToHaveIndexed } from './utils'

describe('show stream', () => {

    it('happy path', async () => {
        const creatorPrivateKey = await fetchPrivateKeyWithGas(KEYSERVER_PORT)
        const client = createTestClient(creatorPrivateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        await waitForTheGraphToHaveIndexed(stream, client)
        await client.destroy()
        const outputLines = await runCommand(`stream show ${stream.id} --include-permissions`)
        const outputJson = JSON.parse(outputLines.join(''))
        expect(outputJson).toMatchObject({
            id: stream.id,
            partitions: 1,
            permissions: [{
                permissions: [
                    'edit',
                    'delete',
                    'publish',
                    'subscribe',
                    'grant'
                ],
                user: new Wallet(creatorPrivateKey).address.toLowerCase()
            }]
        })
    }, 20 * 1000)

})
