import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { randomString } from '@streamr/utils'
import { createTestClient, runCommand, waitForTheGraphToHaveIndexed } from './utils'

describe('search streams', () => {
    it(
        'happy path',
        async () => {
            const testId = randomString(10)
            const client = createTestClient(await fetchPrivateKeyWithGas())
            const stream1 = await client.createStream(`/${testId}-1`)
            const stream2 = await client.createStream(`/${testId}-2`)
            await Promise.all([
                waitForTheGraphToHaveIndexed(stream1, client),
                waitForTheGraphToHaveIndexed(stream2, client)
            ])
            await client.destroy()
            const outputLines = await runCommand(`stream search ${testId}`)
            expect(outputLines).toEqual([stream1.id, stream2.id])
        },
        20 * 1000
    )
})
