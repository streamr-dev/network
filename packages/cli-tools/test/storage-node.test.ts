import { StreamID } from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { until } from '@streamr/utils'
import 'jest-extended'
import { DOCKER_DEV_STORAGE_NODE, createTestClient, runCommand } from './utils'

const isStored = async (streamId: StreamID): Promise<boolean> => {
    const output = await runCommand(`storage-node list-streams ${DOCKER_DEV_STORAGE_NODE}`)
    return output.join().includes(streamId)
}

describe('storage node', () => {

    it('add and remove stream', async () => {
        const privateKey = await createTestPrivateKey({ gas: true })
        const client = createTestClient(privateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        await client.destroy()
        await runCommand(`storage-node add-stream ${DOCKER_DEV_STORAGE_NODE} ${stream.id}`, {
            privateKey
        })
        await until(async () => await isStored(stream.id) === true, 15 * 1000, 1000)
        await runCommand(`storage-node remove-stream ${DOCKER_DEV_STORAGE_NODE} ${stream.id}`, {
            privateKey
        })
        await until(async () => await isStored(stream.id) === false, 15 * 1000, 1000)
    }, 80 * 1000)

    it('list nodes', async () => {
        const outputLines = await runCommand('storage-node list')
        expect(outputLines.join()).toMatch(DOCKER_DEV_STORAGE_NODE.toLowerCase())
    })
})
