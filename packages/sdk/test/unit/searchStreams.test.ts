import 'reflect-metadata'

import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamID, TheGraphClient, collect, toStreamID } from '@streamr/utils'
import { SearchStreamsResultItem, searchStreams } from '../../src/contracts/searchStreams'

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
            createMockResultItem(stream, JSON.stringify({ partitions: 11 }))
        ])
        jest.spyOn(theGraphClient, 'queryEntities')
        const orderBy = { field: 'updatedAt', direction: 'desc' } as const

        await collect(searchStreams('/', undefined, orderBy, theGraphClient as any))

        const graphQLquery = ((theGraphClient as any).queryEntities as jest.Mock).mock.calls[0][0]()
        expect(graphQLquery.query).toMatch(
            new RegExp(`orderBy: "stream__${orderBy.field}",\\s*orderDirection: "${orderBy.direction}"`)
        )
    })
})
