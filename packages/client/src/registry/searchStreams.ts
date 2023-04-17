/* eslint-disable padding-line-between-statements */
import { StreamID, toStreamID } from '@streamr/protocol'
import { StreamQueryResult } from './StreamRegistry'
import { StreamPermission, ChainPermissions, convertChainPermissionsToStreamPermissions, PUBLIC_PERMISSION_ADDRESS } from '../permission'
import { GraphQLClient, GraphQLQuery } from '../utils/GraphQLClient'
import { filter, map, unique } from '../utils/GeneratorUtils'
import { SynchronizedGraphQLClient } from '../utils/SynchronizedGraphQLClient'
import { Stream } from '../Stream'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'

export interface SearchStreamsPermissionFilter {
    user: string
    /*
     * If possible, prefer allOf to anyOf because the query performance is better
     */
    allOf?: StreamPermission[]
    anyOf?: StreamPermission[]
    allowPublic: boolean
}

export interface SearchStreamsOrderBy {
    field: 'id' | 'createdAt' | 'updatedAt'
    direction: 'asc' | 'desc'
}

export type SearchStreamsResultItem = {
    id: string
    userAddress: EthereumAddress
    stream: StreamQueryResult
} & ChainPermissions

export const searchStreams = (
    term: string | undefined,
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    orderBy: SearchStreamsOrderBy,
    graphQLClient: SynchronizedGraphQLClient,
    parseStream: (id: StreamID, metadata: string) => Stream,
    logger: Logger,
): AsyncGenerator<Stream> => {
    if ((term === undefined) && (permissionFilter === undefined)) {
        throw new Error('Requires a search term or a permission filter')
    }
    logger.debug('Search for streams', { term, permissionFilter })
    return map(
        fetchSearchStreamsResultFromTheGraph(term, permissionFilter, orderBy, graphQLClient),
        (item: SearchStreamsResultItem) => parseStream(toStreamID(item.stream.id), item.stream.metadata),
        (err: Error, item: SearchStreamsResultItem) => {
            logger.debug('Omit stream from search result (invalid data)', {
                streamId: item.stream.id,
                reason: err?.message
            })
        }
    )
}

async function* fetchSearchStreamsResultFromTheGraph(
    term: string | undefined,
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    orderBy: SearchStreamsOrderBy,
    graphQLClient: SynchronizedGraphQLClient,
): AsyncGenerator<SearchStreamsResultItem> {
    const backendResults = graphQLClient.fetchPaginatedResults<SearchStreamsResultItem>(
        (lastId: string, pageSize: number) => buildQuery(term, permissionFilter, orderBy, lastId, pageSize)
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
    orderBy: SearchStreamsOrderBy,
    lastId: string,
    pageSize: number
): GraphQLQuery => {
    const variables: Record<string, any> = {
        stream_contains: term,
        id_gt: lastId
    }
    if (permissionFilter !== undefined) {
        variables.userAddress_in = [toEthereumAddress(permissionFilter.user)]
        if (permissionFilter.allowPublic) {
            variables.userAddress_in.push(PUBLIC_PERMISSION_ADDRESS)
        }
        if (permissionFilter.allOf !== undefined) {
            const now = String(Math.round(Date.now() / 1000))
            variables.canEdit = permissionFilter.allOf.includes(StreamPermission.EDIT) ? true : undefined
            variables.canDelete = permissionFilter.allOf.includes(StreamPermission.DELETE) ? true : undefined
            variables.publishExpiration_gt = permissionFilter.allOf.includes(StreamPermission.PUBLISH) ? now : undefined
            variables.subscribeExpiration_gt = permissionFilter.allOf.includes(StreamPermission.SUBSCRIBE) ? now : undefined
            variables.canGrant = permissionFilter.allOf.includes(StreamPermission.GRANT) ? true : undefined
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
            permissions (
                first: ${pageSize},
                orderBy: "stream__${orderBy.field}",
                orderDirection: "${orderBy.direction}", 
                ${GraphQLClient.createWhereClause(variables)}
            ) {
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
    return { query, variables }
}
