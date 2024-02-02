import { Wallet } from '@ethersproject/wallet'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { KEYSERVER_PORT, createTestClient, runCommand } from './utils'

describe('create stream', () => {

    it('happy path', async () => {
        const privateKey = await fetchPrivateKeyWithGas(KEYSERVER_PORT)
        const address = new Wallet(privateKey).address.toLowerCase()
        const path = `/${Date.now()}`
        const streamId = `${address}${path}`
        const outputLines = await runCommand(`stream create ${path}`, {
            privateKey
        })
        const outputJson = JSON.parse(outputLines.join(''))
        expect(outputJson).toMatchObject({
            id: streamId,
            partitions: 1
        })
        const client = createTestClient()
        const stream = await client.getStream(streamId)
        expect(stream.getMetadata().partitions).toBe(1)
        await client.destroy()
    }, 20 * 1000)

})
