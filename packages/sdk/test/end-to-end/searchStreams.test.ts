import { fetchPrivateKeyWithGas, randomUserId } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { SearchStreamsPermissionFilter } from '../../src/contracts/searchStreams'
import { PermissionAssignment, StreamPermission } from '../../src/permission'

const TIMEOUT = 2 * 60 * 1000

const SEARCH_TERM = `mock-search-term-${Date.now()}`

describe('searchStreams', () => {
    let client: StreamrClient
    let streamWithoutPermission: Stream
    let streamWithUserPermission: Stream
    let streamWithPublicPermission: Stream
    let streamWithUserAndPublicPermission: Stream
    let streamWithGrantedAndRevokedPermission: Stream
    const searcher = randomUserId()

    const createTestStreams = async (
        items: {
            streamId: string
            assignments: PermissionAssignment[]
        }[]
    ) => {
        const streams: Stream[] = []
        for (const item of items) {
            streams.push(await client.createStream(item.streamId))
        }
        await client.setPermissions(...items)
        return streams
    }

    const searchStreamIds = async (searchTerm: string, permissionFilter?: SearchStreamsPermissionFilter) => {
        const streams = client.searchStreams(searchTerm, permissionFilter)
        const ids = (await collect(streams)).map((stream) => stream.id)
        ids.sort()
        return ids
    }

    beforeAll(async () => {
        client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        const streams = await createTestStreams([
            { streamId: `/${SEARCH_TERM}/1-no-permissions`, assignments: [] },
            {
                streamId: `/${SEARCH_TERM}/2-user-permission`,
                assignments: [{ userId: searcher, permissions: [StreamPermission.SUBSCRIBE] }]
            },
            {
                streamId: `/${SEARCH_TERM}/3-public-permissions`,
                assignments: [{ public: true, permissions: [StreamPermission.SUBSCRIBE] }]
            },
            {
                streamId: `/${SEARCH_TERM}/4-user-and-public-permissions`,
                assignments: [
                    { userId: searcher, permissions: [StreamPermission.SUBSCRIBE] },
                    { public: true, permissions: [StreamPermission.SUBSCRIBE] }
                ]
            },
            {
                streamId: `/${SEARCH_TERM}/5-granted-and-revoked-permissions`,
                assignments: [
                    { userId: searcher, permissions: [StreamPermission.SUBSCRIBE] },
                    { public: true, permissions: [StreamPermission.SUBSCRIBE] }
                ]
            },
            { streamId: `/${Date.now()}`, assignments: [] }
        ])
        streamWithoutPermission = streams[0]
        streamWithUserPermission = streams[1]
        streamWithPublicPermission = streams[2]
        streamWithUserAndPublicPermission = streams[3]
        streamWithGrantedAndRevokedPermission = streams[4]
        await streamWithGrantedAndRevokedPermission.revokePermissions(
            { userId: searcher, permissions: [StreamPermission.SUBSCRIBE] },
            { public: true, permissions: [StreamPermission.SUBSCRIBE] }
        )
    }, TIMEOUT)

    afterAll(async () => {
        await client.destroy()
    })

    it(
        'search term matches',
        async () => {
            const streamIds = await searchStreamIds(SEARCH_TERM)
            expect(streamIds).toEqual([
                streamWithoutPermission.id,
                streamWithUserPermission.id,
                streamWithPublicPermission.id,
                streamWithUserAndPublicPermission.id,
                streamWithGrantedAndRevokedPermission.id
            ])
        },
        TIMEOUT
    )

    it(
        'no search term matches',
        async () => {
            const streamIds = await searchStreamIds(`no-matches-${Date.now()}`)
            expect(streamIds).toEqual([])
        },
        TIMEOUT
    )

    it(
        'no filters',
        async () => {
            expect(() => {
                client.searchStreams(undefined, undefined)
            }).toThrow('Requires a search term or a permission filter')
        },
        TIMEOUT
    )

    describe('permission filter', () => {
        it(
            'user permissions',
            async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    userId: searcher,
                    allowPublic: false
                })
                expect(streamIds).toEqual([streamWithUserPermission.id, streamWithUserAndPublicPermission.id])
            },
            TIMEOUT
        )

        it(
            'user permissions and public permissions',
            async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    userId: searcher,
                    allowPublic: true
                })
                expect(streamIds).toEqual([
                    streamWithUserPermission.id,
                    streamWithPublicPermission.id,
                    streamWithUserAndPublicPermission.id
                ])
            },
            TIMEOUT
        )

        it(
            'public permissions',
            async () => {
                const streamIds = await searchStreamIds(SEARCH_TERM, {
                    userId: randomUserId(),
                    allowPublic: true
                })
                expect(streamIds).toEqual([streamWithPublicPermission.id, streamWithUserAndPublicPermission.id])
            },
            TIMEOUT
        )

        describe('all of', () => {
            it(
                'match',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        allOf: [StreamPermission.SUBSCRIBE],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([streamWithUserPermission.id, streamWithUserAndPublicPermission.id])
                },
                TIMEOUT
            )

            it(
                'no match',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        allOf: [StreamPermission.SUBSCRIBE, StreamPermission.PUBLISH],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([])
                },
                TIMEOUT
            )

            it(
                'all permission types match',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        allOf: [],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([streamWithUserPermission.id, streamWithUserAndPublicPermission.id])
                },
                TIMEOUT
            )
        })

        describe('any of', () => {
            it(
                'match',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        anyOf: [StreamPermission.SUBSCRIBE, StreamPermission.PUBLISH],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([streamWithUserPermission.id, streamWithUserAndPublicPermission.id])
                },
                TIMEOUT
            )

            it(
                'no match',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        anyOf: [StreamPermission.GRANT],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([])
                },
                TIMEOUT
            )

            it(
                'no possible results',
                async () => {
                    const streamIds = await searchStreamIds(SEARCH_TERM, {
                        userId: searcher,
                        anyOf: [],
                        allowPublic: false
                    })
                    expect(streamIds).toEqual([])
                },
                TIMEOUT
            )
        })
    })
})
