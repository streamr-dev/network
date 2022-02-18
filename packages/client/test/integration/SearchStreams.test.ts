import { Wallet } from 'ethers'
import { randomEthereumAddress } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import ConfigTest from '../../src/ConfigTest'
import { SearchStreamsPermissionFilter } from '../../src/searchStreams'
import { until } from '../../src/utils'
import { collect } from '../../src/utils/GeneratorUtils'
import { fetchPrivateKeyWithGas } from '../test-utils/utils'

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

    const createTestStream = async (path: string, assignments: PermissionAssignment[]) => {
        const stream = await client.createStream(path)
        await stream.grantPermissions(...assignments)
        return stream
    }

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
                privateKey: await fetchPrivateKeyWithGas(),
            },
            autoConnect: false
        })
        streamWithoutPermission = await createTestStream(`/${SEARCH_TERM}/1-no-permissions`, [])
        streamWithUserPermission = await createTestStream(`/${SEARCH_TERM}/2-user-permission`, [
            { user: searcher.address, permissions: [StreamPermission.SUBSCRIBE] }
        ])
        streamWithPublicPermission = await createTestStream(`/${SEARCH_TERM}/3-public-permissions`, [
            { public: true, permissions: [StreamPermission.SUBSCRIBE] }
        ])
        streamWithUserAndPublicPermission = await createTestStream(`/${SEARCH_TERM}/4-user-and-public-permission`, [
            { user: searcher.address, permissions: [StreamPermission.SUBSCRIBE] },
            { public: true, permissions: [StreamPermission.SUBSCRIBE] }
        ])
        streamWithGrantedAndRevokedPermission = await createTestStream(`/${SEARCH_TERM}/5-granted-and-revoked-permission`, [
            { user: searcher.address, permissions: [StreamPermission.SUBSCRIBE] },
            { public: true, permissions: [StreamPermission.SUBSCRIBE] }
        ])
        await streamWithGrantedAndRevokedPermission.revokePermissions(
            { user: searcher.address, permissions: [StreamPermission.SUBSCRIBE] },
            { public: true, permissions: [StreamPermission.SUBSCRIBE] }
        )
        const noSearchTermMatchStream = await createTestStream(`/${Date.now()}`, [])
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
                user: randomEthereumAddress(),
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
