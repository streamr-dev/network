import { Wallet } from 'ethers'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { createTestClient, runCommand } from './utils'

describe('create stream', () => {
    it(
        'happy path',
        async () => {
            const privateKey = await fetchPrivateKeyWithGas()
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
            expect(await stream.getPartitionCount()).toBe(1)
            await client.destroy()
        },
        20 * 1000
    )
})
