import { ChangeFieldType, HexString, StreamID, toUserId, UserID } from '@streamr/utils'
import { MaxUint256 } from 'ethers'
import { StreamIDBuilder } from './StreamIDBuilder'

export enum StreamPermission {
    EDIT = 'edit',
    DELETE = 'delete',
    PUBLISH = 'publish',
    SUBSCRIBE = 'subscribe',
    GRANT = 'grant'
}

export interface UserPermissionQuery {
    streamId: string
    permission: StreamPermission
    userId: HexString
    allowPublic: boolean
}

export interface PublicPermissionQuery {
    streamId: string
    permission: StreamPermission
    public: true
}

export type PermissionQuery = UserPermissionQuery | PublicPermissionQuery

export type InternalUserPermissionQuery = ChangeFieldType<
    ChangeFieldType<UserPermissionQuery, 'streamId', StreamID>,
    'userId',
    UserID
>
export type InternalPublicPermissionQuery = ChangeFieldType<PublicPermissionQuery, 'streamId', StreamID>
export type InternalPermissionQuery = InternalUserPermissionQuery | InternalPublicPermissionQuery

export interface UserPermissionAssignment {
    permissions: StreamPermission[]
    userId: HexString
}

export interface PublicPermissionAssignment {
    permissions: StreamPermission[]
    public: true
}

export type PermissionAssignment = UserPermissionAssignment | PublicPermissionAssignment

export type InternalPermissionAssignment =
    | ChangeFieldType<UserPermissionAssignment, 'userId', UserID>
    | PublicPermissionAssignment

export const PUBLIC_PERMISSION_USER_ID = '0x0000000000000000000000000000000000000000'

export type PermissionQueryResult = {
    id: string
    userId: string
} & ChainPermissions

export interface ChainPermissions {
    canEdit: boolean
    canDelete: boolean
    publishExpiration: bigint
    subscribeExpiration: bigint
    canGrant: boolean
}

export const isPublicPermissionQuery = (query: InternalPermissionQuery): query is InternalPublicPermissionQuery => {
    return (query as InternalPublicPermissionQuery).public === true
}

export const toInternalPermissionQuery = async (
    query: PermissionQuery,
    streamIdBuilder: StreamIDBuilder
): Promise<InternalPermissionQuery> => {
    const typedBaseQuery = {
        ...query,
        streamId: await streamIdBuilder.toStreamID(query.streamId)
    }
    return 'userId' in typedBaseQuery ? { ...typedBaseQuery, userId: toUserId(typedBaseQuery.userId) } : typedBaseQuery
}

export const isPublicPermissionAssignment = (
    assignment: InternalPermissionAssignment
): assignment is PublicPermissionAssignment => {
    return (assignment as PublicPermissionAssignment).public === true
}

export const toInternalPermissionAssignment = (assignment: PermissionAssignment): InternalPermissionAssignment => {
    return 'userId' in assignment ? { ...assignment, userId: toUserId(assignment.userId) } : assignment
}

export const streamPermissionToSolidityType = (permission: StreamPermission): bigint => {
    switch (permission) {
        case StreamPermission.EDIT:
            return 0n
        case StreamPermission.DELETE:
            return 1n
        case StreamPermission.PUBLISH:
            return 2n
        case StreamPermission.SUBSCRIBE:
            return 3n
        case StreamPermission.GRANT:
            return 4n
        default:
            break
    }
    return 0n
}

export const convertChainPermissionsToStreamPermissions = (chainPermissions: ChainPermissions): StreamPermission[] => {
    const now = Math.round(Date.now() / 1000)
    const permissions = []
    if (chainPermissions.canEdit) {
        permissions.push(StreamPermission.EDIT)
    }
    if (chainPermissions.canDelete) {
        permissions.push(StreamPermission.DELETE)
    }
    if (chainPermissions.publishExpiration > now) {
        permissions.push(StreamPermission.PUBLISH)
    }
    if (chainPermissions.subscribeExpiration > now) {
        permissions.push(StreamPermission.SUBSCRIBE)
    }
    if (chainPermissions.canGrant) {
        permissions.push(StreamPermission.GRANT)
    }
    return permissions
}

export const convertStreamPermissionsToChainPermission = (permissions: StreamPermission[]): ChainPermissions => {
    return {
        canEdit: permissions.includes(StreamPermission.EDIT),
        canDelete: permissions.includes(StreamPermission.DELETE),
        publishExpiration: permissions.includes(StreamPermission.PUBLISH) ? MaxUint256 : 0n,
        subscribeExpiration: permissions.includes(StreamPermission.SUBSCRIBE) ? MaxUint256 : 0n,
        canGrant: permissions.includes(StreamPermission.GRANT)
    }
}
