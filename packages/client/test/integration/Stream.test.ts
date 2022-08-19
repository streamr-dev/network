import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'

const DUMMY_ADDRESS = '0x1230000000000000000000000000000000000000'

describe('Stream', () => {
    let client: StreamrClient
    let storageNode: FakeStorageNode

    beforeEach(() => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        storageNode = environment.startStorageNode()
    })

    afterEach(async () => {
        await Promise.allSettled([client?.destroy()])
    })

    describe('addToStorageNode()', () => {

        it('single partition stream', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 1
            })
            await expect(stream.addToStorageNode(storageNode.id)) // resolves after assignment stream messages have arrived
                .resolves
                .toEqual(undefined)
        })

        it('multi-partition stream', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 5
            })
            await expect(stream.addToStorageNode(storageNode.id)) // resolves after assignment stream messages have arrived
                .resolves
                .toEqual(undefined)
        })

        it('assigning stream to non-existing storage node', async () => {
            const stream = await createTestStream(client, module, {
                partitions: 1
            })
            await expect(stream.addToStorageNode(DUMMY_ADDRESS))
                .rejects
                .toThrow('No storage node')
        })
    })

    describe('detectFields', () => {
        it('happy path', async () => {
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode.id)
            expect(stream.config.fields).toEqual([])

            const msg = await stream.publish({
                foo: 123,
            })
            await client.waitForStorage(msg)

            await stream.detectFields()

            const expectedFields = [{
                name: 'foo',
                type: 'number',
            }]
            expect(stream.config.fields).toEqual(expectedFields)
            const loadedStream = await client.getStream(stream.id)
            expect(loadedStream.config.fields).toEqual(expectedFields)
        })
    })
})
