import 'reflect-metadata'

import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamID, TheGraphClient, collect, toStreamID } from '@streamr/utils'
import { StreamMetadata } from '../../src/Stream'
import { SearchStreamsResultItem, searchStreams } from '../../src/contracts/searchStreams'
import { mockLoggerFactory } from '../test-utils/utils'

const MOCK_USER = randomEthereumAddress()

const createMockResultItem = (streamId: StreamID, metadata: string): SearchStreamsResultItem => {
    return {
        id: streamId,
        stream: {
            id: streamId,
            metadata
        },
        canEdit: true,
        canDelete: true,
        publishExpiration: 0n,
        subscribeExpiration: 0n,
        canGrant: true
    }
}

const createMockTheGraphClient = (resultItems: SearchStreamsResultItem[]): Pick<TheGraphClient, 'queryEntities'> => {
    return {
        queryEntities: async function* () {
            yield* resultItems
        } as any
    }
}

describe('searchStreams', () => {

    it('results in order', async () => {
        const stream = toStreamID('/path', MOCK_USER)
        const theGraphClient = createMockTheGraphClient([
            createMockResultItem(stream, JSON.stringify({ partitions: 11 })),
        ])
        jest.spyOn(theGraphClient, 'queryEntities')
        const orderBy = { field: 'updatedAt', direction: 'desc' } as const

        await collect(searchStreams(
            '/',
            undefined,
            orderBy,
            theGraphClient as any,
            undefined as any,
            mockLoggerFactory().createLogger(module),
        ))

        const graphQLquery = ((theGraphClient as any).queryEntities as jest.Mock).mock.calls[0][0]()
        expect(graphQLquery.query).toMatch(new RegExp(`orderBy: "stream__${orderBy.field}",\\s*orderDirection: "${orderBy.direction}"`))
    })

    it('invalid metadata', async () => {
        const stream1 = toStreamID('/1', MOCK_USER)
        const stream2 = toStreamID('/2', MOCK_USER)
        const stream3 = toStreamID('/3', MOCK_USER)
        const stream4 = toStreamID('/4', MOCK_USER)
        const theGraphClient = createMockTheGraphClient([
            createMockResultItem(stream1, JSON.stringify({ partitions: 11 })),
            createMockResultItem(stream2, 'invalid-json'),
            createMockResultItem(stream3, JSON.stringify({ partitions: 150 })),
            createMockResultItem(stream4, JSON.stringify({ partitions: 44 }))
        ])
        const createStream = (id: StreamID, metadata: StreamMetadata) => ({ id, getPartitionCount: () => metadata.partitions })

        const streams = await collect(searchStreams(
            '/',
            undefined,
            { field: 'id', direction: 'asc' },
            theGraphClient as any,
            { createStream } as any,
            mockLoggerFactory().createLogger(module),
        ))

        expect(streams).toHaveLength(2)
        expect(streams[0].id).toBe(stream1)
        expect(streams[0].getPartitionCount()).toBe(11)
        expect(streams[1].id).toBe(stream4)
        expect(streams[1].getPartitionCount()).toBe(44)
    })
})
