import 'reflect-metadata'

import { BigNumber } from '@ethersproject/bignumber'
import { StreamID, toStreamID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { searchStreams, SearchStreamsResultItem } from '../../src/registry/searchStreams'
import { Stream } from '../../src/Stream'
import { collect } from '../../src/utils/iterators'
import { SynchronizedGraphQLClient } from '../../src/utils/SynchronizedGraphQLClient'
import { mockLoggerFactory } from '../test-utils/utils'

const MOCK_USER = randomEthereumAddress()

const createMockResultItem = (streamId: StreamID, metadata: string): SearchStreamsResultItem => {
    return {
        id: streamId,
        userAddress: MOCK_USER,
        stream: {
            id: streamId,
            metadata
        },
        canEdit: true,
        canDelete: true,
        publishExpiration: BigNumber.from(0),
        subscribeExpiration: BigNumber.from(0),
        canGrant: true
    }
}

const createMockGraphQLClient = (resultItems: SearchStreamsResultItem[]): Pick<SynchronizedGraphQLClient, 'fetchPaginatedResults'> => {
    return {
        fetchPaginatedResults: async function* () {
            yield* resultItems
        } as any
    }
}

describe('searchStreams', () => {

    it('invalid metadata', async () => {
        const stream1 = toStreamID('/1', MOCK_USER)
        const stream2 = toStreamID('/2', MOCK_USER)
        const stream3 = toStreamID('/3', MOCK_USER)
        const graphQLClient = createMockGraphQLClient([
            createMockResultItem(stream1, JSON.stringify({ partitions: 11 })),
            createMockResultItem(stream2, 'invalid-json'),
            createMockResultItem(stream3, JSON.stringify({ partitions: 33 }))
        ])
        const parseStream = (id: StreamID, metadata: string): Stream => {
            const props = Stream.parseMetadata(metadata)
            return {
                id,
                getMetadata: () => ({
                    partitions: props.partitions
                })
            } as any
        }

        const streams = await collect(searchStreams(
            '/',
            undefined,
            graphQLClient as any,
            parseStream,
            mockLoggerFactory().createLogger(module)
        ))

        expect(streams).toHaveLength(2)
        expect(streams[0].id).toBe(stream1)
        expect(streams[0].getMetadata().partitions).toBe(11)
        expect(streams[1].id).toBe(stream3)
        expect(streams[1].getMetadata().partitions).toBe(33)
    })
})
