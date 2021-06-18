import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/stream'
import { fakePrivateKey, getPublishTestMessages, createTestStream } from '../utils'
import { StorageNode } from '../../src/stream/StorageNode'

import { clientOptions } from './devEnvironment'

const createClient = (opts = {}) => new StreamrClient({
    ...clientOptions,
    auth: {
        privateKey: fakePrivateKey(),
    },
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
})

describe('Stream', () => {
    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        client = createClient()
        await client.connect()

        stream = await createTestStream(client, module)
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
    })

    afterEach(async () => {
        await client.disconnect()
    })

    describe('detectFields()', () => {
        it('does detect primitive types', async () => {
            const msg = {
                number: 123,
                boolean: true,
                object: {
                    k: 1,
                    v: 2,
                },
                array: [1, 2, 3],
                string: 'test',
            }
            const publishTestMessages = getPublishTestMessages(client, {
                streamId: stream.id,
                waitForLast: true,
                createMessage: () => msg,
            })
            await publishTestMessages(1)

            expect(stream.config.fields).toEqual([])
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
            const msg = {
                null: null,
                empty: {},
                func: () => null,
                nonexistent: undefined,
                symbol: Symbol('test'),
                // TODO: bigint: 10n,
            }
            const publishTestMessages = getPublishTestMessages(client, {
                streamId: stream.id,
                waitForLast: true,
                createMessage: () => msg,
            })
            await publishTestMessages(1)

            expect(stream.config.fields).toEqual([])
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
