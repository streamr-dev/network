/* eslint-disable padding-line-between-statements */
import { EthereumAddress } from 'streamr-client-protocol'
import { StreamPermission } from './Stream'
import { ChainPermissions, PUBLIC_PERMISSION_ADDRESS, StreamQueryResult, StreamRegistry } from './StreamRegistry'
import { GraphQLClient } from './utils/GraphQLClient'
import { filter, unique } from './utils/GeneratorUtils'

export interface SearchStreamsPermissionFilter {
    user: EthereumAddress
    /*
     * If possible, prefer allOf to anyOf because the query performance is better
     */
    allOf?: StreamPermission[]
    anyOf?: StreamPermission[]
    allowPublic: boolean
}

export type SearchStreamsQueryItem = {
    id: string
    userAddress: string
    stream: StreamQueryResult
} & ChainPermissions

export async function* fetchSearchStreamsResultFromTheGraph(
    term: string | undefined,
    permissionFilter: SearchStreamsPermissionFilter | undefined,
    graphQLClient: GraphQLClient,
): AsyncGenerator<SearchStreamsQueryItem> {
    const backendResults = graphQLClient.fetchPaginatedResults<SearchStreamsQueryItem>(
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
         * Usually The Graph returns only assigments which contains one or more granted permissions
         * as The Graphs adds the Permission entity to the index only when we grant a permission.
         * But if a user revokes all permissions from an assignment, The Graph doesn't remove the
         * entity. Therefore we may receive an assignment which doesn't have any permissions granted.
         * Similar situation may happen also when some expirable permission (subscribe or publish)
         * expire as the expiration doesn't trigger the removal of the Permission entity.
         * -> To filter out these empty assignments, we define a fallback value for anyOf filter
         */
        const anyOf = permissionFilter.anyOf ?? Object.values(StreamPermission) as StreamPermission[]
        yield* filter(withoutDuplicates, (item: SearchStreamsQueryItem) => {
            const actual = StreamRegistry.getPermissionsFromChainPermissions(item)
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
