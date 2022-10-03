import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { Stream } from '../../src/Stream'

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

    describe('addToStorageNode', () => {

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

        let stream: Stream

        beforeEach(async () => {
            stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode.id)
        })

        it('primitive types', async () => {
            const msg = await stream.publish({
                number: 123,
                boolean: true,
                object: {
                    k: 1,
                    v: 2,
                },
                array: [1, 2, 3],
                string: 'test'
            })
            await client.waitForStorage(msg)

            await stream.detectFields()

            const expectedFields = [
                {
                    name: 'number',
                    type: 'number',
                },
                {
                    name: 'boolean',
                    type: 'boolean',
                },
                {
                    name: 'object',
                    type: 'map',
                },
                {
                    name: 'array',
                    type: 'list',
                },
                {
                    name: 'string',
                    type: 'string',
                },
            ]
            expect(stream.config.fields).toEqual(expectedFields)
            const loadedStream = await client.getStream(stream.id)
            expect(loadedStream.config.fields).toEqual(expectedFields)
        })

        it('skips unsupported types', async () => {
            const msg = await stream.publish({
                null: null,
                empty: {},
                func: () => null,
                nonexistent: undefined,
                symbol: Symbol('test'),
                // TODO: bigint: 10n,
            })
            await client.waitForStorage(msg)

            await stream.detectFields()

            const expectedFields = [
                {
                    name: 'null',
                    type: 'map',
                },
                {
                    name: 'empty',
                    type: 'map',
                },
            ]
            expect(stream.config.fields).toEqual(expectedFields)
            const loadedStream = await client.getStream(stream.id)
            expect(loadedStream.config.fields).toEqual(expectedFields)
        })
    })
})
