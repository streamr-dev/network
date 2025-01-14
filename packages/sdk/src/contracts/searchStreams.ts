import { ChangeFieldType, GraphQLQuery, HexString, TheGraphClient, toUserId, UserID } from '@streamr/utils'
import {
    ChainPermissions,
    convertChainPermissionsToStreamPermissions,
    PUBLIC_PERMISSION_USER_ID,
    StreamPermission
} from '../permission'
import { filter, unique } from '../utils/GeneratorUtils'
import { StreamQueryResult } from './StreamRegistry'

export interface SearchStreamsPermissionFilter {
    userId: HexString
    /*
     * If possible, prefer allOf to anyOf because the query performance is better
     */
    allOf?: StreamPermission[]
    anyOf?: StreamPermission[]
    allowPublic: boolean
}

export type InternalSearchStreamsPermissionFilter = ChangeFieldType<SearchStreamsPermissionFilter, 'userId', UserID>

export interface SearchStreamsOrderBy {
    field: 'id' | 'createdAt' | 'updatedAt'
    direction: 'asc' | 'desc'
}

export type SearchStreamsResultItem = {
    id: string
    stream: StreamQueryResult
} & ChainPermissions

export const toInternalSearchStreamsPermissionFilter = (
    filter: SearchStreamsPermissionFilter
): InternalSearchStreamsPermissionFilter => {
    return {
        ...filter,
        userId: toUserId(filter.userId)
    }
}

export async function* searchStreams(
    term: string | undefined,
    permissionFilter: InternalSearchStreamsPermissionFilter | undefined,
    orderBy: SearchStreamsOrderBy,
    theGraphClient: TheGraphClient
): AsyncGenerator<SearchStreamsResultItem> {
    const backendResults = theGraphClient.queryEntities<SearchStreamsResultItem>((lastId: string, pageSize: number) =>
        buildQuery(term, permissionFilter, orderBy, lastId, pageSize)
    )
    /*
     * There can be orphaned permission entities if a stream is deleted (currently
     * we don't remove the assigned permissions, see ETH-222)
     * TODO remove the filtering when ETH-222 has been implemented
     */
    const withoutOrphaned = filter(backendResults, (p) => p.stream !== null)
    /*
     * As we query via permissions entity, any stream can appear multiple times (once per
     * permission user) if we don't do have exactly one userId in the GraphQL query.
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
        const anyOf = permissionFilter.anyOf ?? (Object.values(StreamPermission) as StreamPermission[])
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
    permissionFilter: InternalSearchStreamsPermissionFilter | undefined,
    orderBy: SearchStreamsOrderBy,
    lastId: string,
    pageSize: number
): GraphQLQuery => {
    const variables: Record<string, any> = {
        stream_contains: term,
        id_gt: lastId
    }
    if (permissionFilter !== undefined) {
        variables.userId_in = [permissionFilter.userId]
        if (permissionFilter.allowPublic) {
            variables.userId_in.push(PUBLIC_PERMISSION_USER_ID)
        }
        if (permissionFilter.allOf !== undefined) {
            const now = String(Math.round(Date.now() / 1000))
            variables.canEdit = permissionFilter.allOf.includes(StreamPermission.EDIT) ? true : undefined
            variables.canDelete = permissionFilter.allOf.includes(StreamPermission.DELETE) ? true : undefined
            variables.publishExpiration_gt = permissionFilter.allOf.includes(StreamPermission.PUBLISH) ? now : undefined
            variables.subscribeExpiration_gt = permissionFilter.allOf.includes(StreamPermission.SUBSCRIBE)
                ? now
                : undefined
            variables.canGrant = permissionFilter.allOf.includes(StreamPermission.GRANT) ? true : undefined
        }
    }
    const query = `
        query (
            $stream_contains: String,
            $userId_in: [Bytes!]
            $canEdit: Boolean
            $canDelete: Boolean
            $publishExpiration_gt: BigInt
            $subscribeExpiration_gt: BigInt
            $canGrant: Boolean
            $id_gt: String
        ) {
            streamPermissions (
                first: ${pageSize},
                orderBy: "stream__${orderBy.field}",
                orderDirection: "${orderBy.direction}", 
                ${TheGraphClient.createWhereClause(variables)}
            ) {
                id
                stream {
                    id
                    metadata
                }
                canEdit
                canDelete
                publishExpiration
                subscribeExpiration
                canGrant
            }
        }`
    return { query, variables }
}
