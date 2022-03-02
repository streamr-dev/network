import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { getPublishTestMessages, createTestStream } from '../test-utils/utils'
import { createClientFactory } from '../test-utils/fake/fakeEnvironment'

import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'

jest.setTimeout(30000)

describe('Stream', () => {
    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        client = createClientFactory().createClient()

        stream = await createTestStream(client, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
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
            const publishTestMessages = getPublishTestMessages(client, stream, {
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
            const publishTestMessages = getPublishTestMessages(client, stream, {
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
