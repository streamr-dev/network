import { ChangeFieldType, GraphQLQuery, HexString, TheGraphClient, toUserId, UserID } from '@streamr/utils'
import { PUBLIC_PERMISSION_USER_ID, StreamPermission } from '../permission'

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

export interface SearchStreamsResultItem {
    id: string
    metadata: string
}

export const toInternalSearchStreamsPermissionFilter = (filter: SearchStreamsPermissionFilter): InternalSearchStreamsPermissionFilter => {
    return {
        ...filter,
        userId: toUserId(filter.userId)
    }
}

export async function* searchStreams(
    term: string | undefined,
    permissionFilter: InternalSearchStreamsPermissionFilter | undefined,
    theGraphClient: TheGraphClient,
): AsyncGenerator<SearchStreamsResultItem> {
    yield* theGraphClient.queryEntities<SearchStreamsResultItem>(
        (lastId: string, pageSize: number) => buildQuery(term, permissionFilter, lastId, pageSize)
    )
}

const escapeStringValue = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')   // escape backslashes and double quotes
const wrapWithQuotes = (s: string) => `"${s}"`
const wrapSubExpression = (s: string) => `{ ${s} }`

const createPermissionFilterExpression = (permissions: StreamPermission[], operator: 'and' | 'or', nowTimestampInSeconds: number) => {
    const subExpressions: string[] = []
    if (permissions.includes(StreamPermission.EDIT)) {
        subExpressions.push('canEdit: true')
    }
    if (permissions.includes(StreamPermission.DELETE)) {
        subExpressions.push('canDelete: true')
    }
    if (permissions.includes(StreamPermission.PUBLISH)) {
        subExpressions.push(`publishExpiration_gt: "${nowTimestampInSeconds}"`)
    }
    if (permissions.includes(StreamPermission.SUBSCRIBE)) {
        subExpressions.push(`subscribeExpiration_gt: "${nowTimestampInSeconds}"`)
    }
    if (permissions.includes(StreamPermission.GRANT)) {
        subExpressions.push('canGrant: true')
    }
    return `${operator}: [${subExpressions.map(wrapSubExpression).join(', ')}]`
}

const buildQuery = (
    term: string | undefined,
    permissionFilter: InternalSearchStreamsPermissionFilter | undefined,
    lastId: string,
    pageSize: number
): GraphQLQuery => {
    const whereExpressions: string[] = []
    whereExpressions.push(`id_gt: "${escapeStringValue(lastId)}"`)
    if (term !== undefined) {
        whereExpressions.push(`idAsString_contains: "${escapeStringValue(term)}"`)
    }
    if (permissionFilter !== undefined) {
        const permissionExpressions: string[] = []
        const userId: string[] = [permissionFilter.userId]
        if (permissionFilter.allowPublic) {
            userId.push(PUBLIC_PERMISSION_USER_ID)
        }
        permissionExpressions.push(`userId_in: [${userId.map(wrapWithQuotes).join(',')}]`)
        const nowTimestampInSeconds = Math.round(Date.now() / 1000)
        if (permissionFilter.allOf !== undefined) {
            permissionExpressions.push(createPermissionFilterExpression(permissionFilter.allOf, 'and', nowTimestampInSeconds))
        }
        /*
         * There are situations where the The Graph may contain empty assignments (all boolean flags false,
         * and all expirations in the past). E.g.:
         * - if we granted some permissions to a user, but then removed all those permissions
         * - if we granted an expirable permission (subscribe or publish), and it has now expired
         * We don't want to return empty assignments to the user, because from user's perspective those are
         * non-existing assignments. That's why we apply this extra virtual anyOf filter if none of the user-given
         * permission filters limit the result set in any way.
         */
        const anyOfFilter = permissionFilter.anyOf 
            ?? (((permissionFilter.allOf === undefined) || (permissionFilter.allOf.length === 0)) 
                ? Object.values(StreamPermission) as StreamPermission[]
                : undefined)
        if (anyOfFilter !== undefined) {
            permissionExpressions.push(createPermissionFilterExpression(anyOfFilter, 'or', nowTimestampInSeconds))
        }
        whereExpressions.push(`permissions_: { and: [${permissionExpressions.map(wrapSubExpression).join(', ')}] }`)
    }
    const query = `
        query {
            streams (
                first: ${pageSize}
                orderBy: "id"
                where: {
                    ${whereExpressions.join(', ')}
                }
            ) {
                id
                metadata
            }
        }`
    return { query }
}
