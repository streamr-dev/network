import { Wallet } from 'ethers'
import StreamrClient, { ConfigTest, SearchStreamsPermissionFilter, Stream, StreamPermission } from '../../src'
import { until } from '../../src/utils'
import { collect } from '../../src/utils/GeneratorUtils'
import { fakeAddress, getPrivateKey } from '../utils'

jest.setTimeout(2 * 60 * 1000)

const SEARCH_TERM = `mock-search-term-${Date.now()}`

describe('SearchStreams', () => {

    let client: StreamrClient
    let streamWithoutPermission: Stream
    let streamWithUserPermission: Stream
    let streamWithPublicPermission: Stream
    let streamWithUserAndPublicPermission: Stream
    let streamWithGrantedAndRevokedPermission: Stream
    const searcher = Wallet.createRandom()

    const waitUntilStreamsExistOnTheGraph = async (streams: Stream[]) => {
        return Promise.all(streams.map((stream: Stream) => {
            return until(
                () => { return client.streamExistsOnTheGraph(stream.id) },
                20000,
                500,
                () => `timed out while waiting for streamrClient.streamExistsOnTheGraph(${stream.id})`
            )
        }))
    }

    const searchStreamIds = async (searchTerm: string, permissionFilter?: SearchStreamsPermissionFilter) => {
        const streams = client.searchStreams(searchTerm, permissionFilter)
        const ids = (await collect(streams)).map((stream) => stream.id)
        ids.sort()
        return ids
    }

    beforeAll(async () => {
        client = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: await getPrivateKey(),
            },
            autoConnect: false
        })
        streamWithoutPermission = await client.createStream(`/${SEARCH_TERM}/1-no-permissions`)
        streamWithUserPermission = await client.createStream(`/${SEARCH_TERM}/2-user-permission`)
        await streamWithUserPermission.grantUserPermission(StreamPermission.SUBSCRIBE, searcher.address)
        streamWithPublicPermission = await client.createStream(`/${SEARCH_TERM}/3-public-permissions`)
        await streamWithPublicPermission.grantPublicPermission(StreamPermission.SUBSCRIBE)
        streamWithUserAndPublicPermission = await client.createStream(`/${SEARCH_TERM}/4-user-and-public-permission`)
        await streamWithUserAndPublicPermission.grantUserPermission(StreamPermission.SUBSCRIBE, searcher.address)
        await streamWithUserAndPublicPermission.grantPublicPermission(StreamPermission.SUBSCRIBE)
        streamWithGrantedAndRevokedPermission = await client.createStream(`/${SEARCH_TERM}/5-granted-and-revoked-permission`)
        await streamWithGrantedAndRevokedPermission.grantUserPermission(StreamPermission.SUBSCRIBE, searcher.address)
        await streamWithGrantedAndRevokedPermission.grantPublicPermission(StreamPermission.SUBSCRIBE)
        await streamWithGrantedAndRevokedPermission.revokeUserPermission(StreamPermission.SUBSCRIBE, searcher.address)
        await streamWithGrantedAndRevokedPermission.revokePublicPermission(StreamPermission.SUBSCRIBE)
        const noSearchTermMatchStream = await client.createStream(`/${Date.now()}`)
        await waitUntilStreamsExistOnTheGraph([
            streamWithoutPermission,
            streamWithUserPermission,
            streamWithPublicPermission,
            streamWithUserAndPublicPermission,
            streamWithGrantedAndRevokedPermission,
            noSearchTermMatchStream
        ])
    })

    afterAll(async () => {
        await client?.destroy()
    })

    it('search term matches', async () => {
        const streamIds = await searchStreamIds(SEARCH_TERM)
        expect(streamIds).toEqual([
            streamWithoutPermission.id,
            streamWithUserPermission.id,
            streamWithPublicPermission.id,
            streamWithUserAndPublicPermission.id,
            streamWithGrantedAndRevokedPermission.id,
        ])
    })

    it('no search term matches', async () => {
        const streamIds = await searchStreamIds(`no-matches-${Date.now()}`)
        expect(streamIds).toEqual([])
    })

    it('no filters', async () => {
        const iterable = client.searchStreams(undefined, undefined)
        // most likely many items created by various tests, check that we can read some item
        const firstItem = (await iterable[Symbol.asyncIterator]().next()).value
        expect(firstItem.id).toBeDefined()
    })

    describe('permission filter', () => {

        it('user permissions', async () => {
            const streamIds = await searchStreamIds(SEARCH_TERM, {
                user: searcher.address,
                allowPublic: false
            })
            expect(streamIds).toEqual([
                streamWithUserPermission.id,
                streamWithUserAndPublicPermission.id
            ])
        })

        it('user permissions and public permissions', async () => {
            const streamIds = await searchStreamIds(SEARCH_TERM, {
                user: searcher.address,
                allowPublic: true
            })
            expect(streamIds).toEqual([
                streamWithUserPermission.id,
                streamWithPublicPermission.id,
                streamWithUserAndPublicPermission.id
            ])
        })

        it('public permissions', async () => {
            const streamIds = await searchStreamIds(SEARCH_TERM, {
                user: fakeAddress(),
                allowPublic: true
            })
            expect(streamIds).toEqual([
                streamWithPublicPermission.id,
                streamWithUserAndPublicPermission.id
            ])
        })

        describe('all of', () => {
            it('match', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    allOf: [StreamPermission.SUBSCRIBE],
                    allowPublic: false
                })
                expect(streamIds).toEqual([
                    streamWithUserPermission.id,
                    streamWithUserAndPublicPermission.id
                ])
            })

            it('no match', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    allOf: [StreamPermission.SUBSCRIBE, StreamPermission.PUBLISH],
                    allowPublic: false
                })
                expect(streamIds).toEqual([])
            })

            it('all permission types match', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    allOf: [],
                    allowPublic: false
                })
                expect(streamIds).toEqual([
                    streamWithUserPermission.id,
                    streamWithUserAndPublicPermission.id
                ])
            })
        })

        describe('any of', () => {
            it('match', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    anyOf: [StreamPermission.SUBSCRIBE, StreamPermission.PUBLISH],
                    allowPublic: false
                })
                expect(streamIds).toEqual([
                    streamWithUserPermission.id,
                    streamWithUserAndPublicPermission.id
                ])
            })

            it('no match', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    anyOf: [StreamPermission.GRANT],
                    allowPublic: false
                })
                expect(streamIds).toEqual([])
            })

            it('no possible results', async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    user: searcher.address,
                    anyOf: [],
                    allowPublic: false
                })
                expect(streamIds).toEqual([])
            })
        })
    })
})
