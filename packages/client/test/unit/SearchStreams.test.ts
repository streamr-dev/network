import 'reflect-metadata'
import { BigNumber } from '@ethersproject/bignumber'
import { StreamID, StreamIDUtils, toStreamID } from 'streamr-client-protocol'
import { SearchStreamsResultItem } from '../../src/registry/searchStreams'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { collect } from '../../src/utils/GeneratorUtils'
import { createMockAddress } from '../test-utils/utils'
import { ConfigTest } from '../../src'

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

const createMockStreamRegistry = (resultItems: SearchStreamsResultItem[], debugLog: jest.Mock<void, []>) => {
    return new StreamRegistry(
        {
            debug: {
                extend: () => debugLog
            }
        } as any,
        undefined as any,
        {
            resolve: () => undefined
        } as any,
        {
            streamRegistryChainAddress: ''
        } as any,
        {
            // eslint-disable-next-line generator-star-spacing
            async *fetchPaginatedResults() {
                yield* resultItems
            }
        } as any,
        undefined as any,
        undefined as any,
        {
            // this is not used, but StreamRegistry needs a valid RPC configuration
            // as it creates a Contract instance in constructor
            streamRegistryChainRPCs: ConfigTest.streamRegistryChainRPCs!
        }
    )
}

describe('SearchStreams', () => {
    it('invalid metadata', async () => {
        const stream1 = toStreamID('/1', MOCK_USER)
        const stream2 = toStreamID('/2', MOCK_USER)
        const stream3 = toStreamID('/3', MOCK_USER)
        const debugLog = jest.fn()
        const registry = createMockStreamRegistry([
            createMockResultItem(stream1, JSON.stringify({ partitions: 11 })),
            createMockResultItem(stream2, 'invalid-json'),
            createMockResultItem(stream3, JSON.stringify({ partitions: 33 }))
        ], debugLog)
        const streams = await collect(registry.searchStreams('/', undefined))
        expect(streams).toHaveLength(2)
        expect(streams[0].id).toBe(stream1)
        expect(streams[0].partitions).toBe(11)
        expect(streams[1].id).toBe(stream3)
        expect(streams[1].partitions).toBe(33)
        expect(debugLog).toBeCalledWith(
            'Omitting stream %s from result because %s',
            stream2,
            'Could not parse properties from onchain metadata: invalid-json'
        )
    })
})
