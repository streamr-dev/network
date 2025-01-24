import { StreamID } from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { until } from '@streamr/utils'
import 'jest-extended'
import { DOCKER_DEV_STORAGE_NODE, createTestClient, runCommand } from './utils'
import { Wallet } from 'ethers'

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

    it('register storage node, show info, and finally unregister', async () => {
        const privateKey = await createTestPrivateKey({ gas: true })
        const publicAddress = new Wallet(privateKey).address

        const urls = 'http://foobar.com,http://foobar.org'
        await runCommand(`storage-node register ${urls}`, {
            privateKey
        })

        const outputLines = await runCommand(`storage-node show ${publicAddress}`)
        expect(outputLines.join()).toContain('http://foobar.com')
        expect(outputLines.join()).toContain('http://foobar.org')

        await runCommand('storage-node unregister', {
            privateKey
        })
        const outputLines2 = await runCommand('storage-node list')
        expect(outputLines2.join()).not.toContain(publicAddress.toLowerCase())
    }, 80 * 1000)
})
