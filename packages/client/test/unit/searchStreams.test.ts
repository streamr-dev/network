import 'reflect-metadata'
import { BigNumber } from '@ethersproject/bignumber'
import { StreamID, StreamIDUtils, toStreamID } from 'streamr-client-protocol'
import { searchStreams, SearchStreamsResultItem } from '../../src/registry/searchStreams'
import { collect } from '../../src/utils/GeneratorUtils'
import { createMockAddress } from '../test-utils/utils'
import { Stream } from '../../src/Stream'
import { SynchronizedGraphQLClient } from '../../src/utils/SynchronizedGraphQLClient'

const MOCK_USER = createMockAddress()

const createMockResultItem = (streamId: StreamID, metadata: string): SearchStreamsResultItem => {
    return {
        id: streamId,
        userAddress: StreamIDUtils.getDomain(streamId)!,
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
        const parseStream = (id: StreamID, metadata: string): Pick<Stream, 'id' | 'partitions'> => {
            const props = Stream.parsePropertiesFromMetadata(metadata)
            return {
                id,
                partitions: props.partitions!
            }
        }
        const logger = jest.fn()

        const streams = await collect(searchStreams('/', undefined, graphQLClient as any, parseStream as any, logger as any))

        expect(streams).toHaveLength(2)
        expect(streams[0].id).toBe(stream1)
        expect(streams[0].partitions).toBe(11)
        expect(streams[1].id).toBe(stream3)
        expect(streams[1].partitions).toBe(33)
        expect(logger).toBeCalledWith(
            'Omitting stream %s from result because %s',
            stream2,
            'Could not parse properties from onchain metadata: invalid-json'
        )
    })
})
