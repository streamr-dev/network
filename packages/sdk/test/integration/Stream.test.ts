import 'reflect-metadata'

import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { createTestStream } from '../test-utils/utils'

const DUMMY_ADDRESS = '0x1230000000000000000000000000000000000000'

describe('Stream', () => {
    let client: StreamrClient
    let storageNode: FakeStorageNode
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        storageNode = await environment.startStorageNode()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('addToStorageNode', () => {
        it('single partition stream', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 1
            })
            await expect(stream.addToStorageNode(storageNode.getAddress(), { wait: true })) // resolves after assignment stream messages have arrived
                .resolves.toEqual(undefined)
        })

        it('multi-partition stream', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 5
            })
            await expect(stream.addToStorageNode(storageNode.getAddress(), { wait: true })) // resolves after assignment stream messages have arrived
                .resolves.toEqual(undefined)
        })

        it('assigning stream to non-existing storage node', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 1
            })
            await expect(stream.addToStorageNode(DUMMY_ADDRESS)).rejects.toThrow('No storage node')
        })
    })
})
