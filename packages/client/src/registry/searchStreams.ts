/* eslint-disable padding-line-between-statements */
import { EthereumAddress, StreamID, toStreamID } from 'streamr-client-protocol'
import { StreamQueryResult } from './StreamRegistry'
import { StreamPermission, ChainPermissions, convertChainPermissionsToStreamPermissions, PUBLIC_PERMISSION_ADDRESS } from '../permission'
import { GraphQLClient } from '../utils/GraphQLClient'
import { filter, map, unique } from '../utils/GeneratorUtils'
import { SynchronizedGraphQLClient } from '../utils/SynchronizedGraphQLClient'
import { Stream } from '../Stream'
import { Debugger } from '../utils/log'

export interface SearchStreamsPermissionFilter {
    user: EthereumAddress
    /*
     * If possible, prefer allOf to anyOf because the query performance is better
     */
    allOf?: StreamPermission[]
    anyOf?: StreamPermission[]
    allowPublic: boolean
}

export type SearchStreamsResultItem = {
    id: string
    userAddress: EthereumAddress
    stream: StreamQueryResult
} & ChainPermissions

export async function* searchStreams(
    term: string | undefined, 
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    graphQLClient: SynchronizedGraphQLClient,
    parseStream: (id: StreamID, metadata: string) => Stream,
    debug: Debugger
): AsyncGenerator<Stream> {
    if ((term === undefined) && (permissionFilter === undefined)) {
        throw new Error('Requires a search term or a permission filter')
    }
    debug('Search streams term=%s permissions=%j', term, permissionFilter)
    yield* map(
        fetchSearchStreamsResultFromTheGraph(term, permissionFilter, graphQLClient),
        (item: SearchStreamsResultItem) => parseStream(toStreamID(item.stream.id), item.stream.metadata),
        (err: Error, item: SearchStreamsResultItem) => debug('Omitting stream %s from result because %s', item.stream.id, err.message)
    )
}

async function* fetchSearchStreamsResultFromTheGraph(
    term: string | undefined,
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    graphQLClient: SynchronizedGraphQLClient
): AsyncGenerator<SearchStreamsResultItem> {
    const backendResults = graphQLClient.fetchPaginatedResults<SearchStreamsResultItem>(
        (lastId: string, pageSize: number) => buildQuery(term, permissionFilter, lastId, pageSize)
    )
    /*
     * There can be orphaned permission entities if a stream is deleted (currently
     * we don't remove the assigned permissions, see ETH-222)
     * TODO remove the filtering when ETH-222 has been implemented
     */
    const withoutOrphaned = filter(backendResults, (p) => p.stream !== null)
    /*
     * As we query via permissions entity, any stream can appear multiple times (once per
     * permission user) if we don't do have exactly one userAddress in the GraphQL query.
     * That is the case if no permission filter is defined at all, or if permission.allowPublic
     * is true (then it appears twice: once for the user, and once for the public address).
     */
    const withoutDuplicates = unique(withoutOrphaned, (p) => p.stream.id)

    if (permissionFilter !== undefined) {
        /*
         * There are situations where the The Graph may contain empty assignments (all boolean flags false,
         * and all expirations in the past). E.g.:
         * - if we granted some permissions to a user, but then removed all those permissions
         * - if we granted an expirable permission (subscribe or publish), and it has now expired
         * We don't want to return empty assignments to the user, because from user's perspective those are
         * non-existing assignments.
         * -> Here we filter out the empty assignments by defining a fallback value for anyOf filter
         */
        const anyOf = permissionFilter.anyOf ?? Object.values(StreamPermission) as StreamPermission[]
        yield* filter(withoutDuplicates, (item: SearchStreamsResultItem) => {
            const actual = convertChainPermissionsToStreamPermissions(item)
            return anyOf.some((p) => actual.includes(p))
        })
    } else {
        yield* withoutDuplicates
    }
}

/*
 * Note that we query the results via permissions entity even if there is no permission filter
 * defined. It is maybe possible to optimize the non-permission related queries by searching over
 * the Stream entity. To support that we'd need to add a new field to The Graph (e.g. "idAsString"),
 * as we can't do substring filtering by Stream id field (there is no "id_contains" because
 * ID type is not a string)
 */
const buildQuery = (
    term: string | undefined,
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    lastId: string,
    pageSize: number
): string => {
    const variables: Record<string, any> = {
        stream_contains: term,
        id_gt: lastId
    }
    if (permissionFilter !== undefined) {
        variables.userAddress_in = [permissionFilter.user]
        if (permissionFilter.allowPublic) {
            variables.userAddress_in.push(PUBLIC_PERMISSION_ADDRESS)
        }
        if (permissionFilter.allOf !== undefined) {
            const now = String(Date.now())
            variables.canEdit = permissionFilter.allOf.includes(StreamPermission.EDIT)
            variables.canDelete = permissionFilter.allOf.includes(StreamPermission.DELETE)
            variables.publishExpiration_gt = permissionFilter.allOf.includes(StreamPermission.PUBLISH) ? now : undefined
            variables.subscribeExpiration_gt = permissionFilter.allOf.includes(StreamPermission.SUBSCRIBE) ? now : undefined
            variables.canGrant = permissionFilter.allOf.includes(StreamPermission.GRANT)
        }
    }
    const query = `
        query (
            $stream_contains: String,
            $userAddress_in: [Bytes!]
            $canEdit: Boolean
            $canDelete: Boolean
            $publishExpiration_gt: BigInt
            $subscribeExpiration_gt: BigInt
            $canGrant: Boolean
            $id_gt: String
        ) {
            permissions (first: ${pageSize} ${GraphQLClient.createWhereClause(variables)}) {
                id
                stream {
                    id
                    metadata
                }
                userAddress
                canEdit
                canDelete
                publishExpiration
                subscribeExpiration
                canGrant
            }
        }`
    return JSON.stringify({ query, variables })
}
