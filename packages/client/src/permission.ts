import { MaxInt256 } from '@ethersproject/constants'
import { BigNumber } from '@ethersproject/bignumber'
import { EthereumAddress } from 'streamr-client-protocol'

export enum StreamPermission {
    EDIT = 'edit',
    DELETE = 'delete',
    PUBLISH = 'publish',
    SUBSCRIBE = 'subscribe',
    GRANT = 'grant'
}

export interface UserPermissionQuery {
    streamId: string,
    permission: StreamPermission
    user: EthereumAddress
    allowPublic: boolean
}

export interface PublicPermissionQuery {
    streamId: string,
    permission: StreamPermission
    public: true
}

export type PermissionQuery = UserPermissionQuery | PublicPermissionQuery

export interface UserPermissionAssignment {
    permissions: StreamPermission[]
    user: EthereumAddress
}

export interface PublicPermissionAssignment {
    permissions: StreamPermission[]
    public: true
}

export type PermissionAssignment = UserPermissionAssignment | PublicPermissionAssignment

export const PUBLIC_PERMISSION_ADDRESS = '0x0000000000000000000000000000000000000000'

export type PermissionQueryResult = {
    id: string
    userAddress: EthereumAddress
} & ChainPermissions

export type SingleStreamQueryResult = {
    stream: {
        id: string
        metadata: string
        permissions: PermissionQueryResult[]
    } | null
}

export type ChainPermissions = {
    canEdit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    canGrant: boolean
}

export const isPublicPermissionQuery = (query: PermissionQuery): query is PublicPermissionQuery => {
    return (query as PublicPermissionQuery).public === true
}

export const isPublicPermissionAssignment = (query: PermissionAssignment): query is PublicPermissionAssignment => {
    return (query as PublicPermissionAssignment).public === true
}

export const streamPermissionToSolidityType = (permission: StreamPermission): BigNumber => {
    switch (permission) {
        case StreamPermission.EDIT:
            return BigNumber.from(0)
        case StreamPermission.DELETE:
            return BigNumber.from(1)
        case StreamPermission.PUBLISH:
            return BigNumber.from(2)
        case StreamPermission.SUBSCRIBE:
            return BigNumber.from(3)
        case StreamPermission.GRANT:
            return BigNumber.from(4)
        default:
            break
    }
    return BigNumber.from(0)
}

/* eslint-disable padding-line-between-statements */
export const convertChainPermissionsToStreamPermissions = (chainPermissions: ChainPermissions): StreamPermission[] => {
    const now = Date.now()
    const permissions = []
    if (chainPermissions.canEdit) {
        permissions.push(StreamPermission.EDIT)
    }
    if (chainPermissions.canDelete) {
        permissions.push(StreamPermission.DELETE)
    }
    if (BigNumber.from(chainPermissions.publishExpiration).gt(now)) {
        permissions.push(StreamPermission.PUBLISH)
    }
    if (BigNumber.from(chainPermissions.subscribeExpiration).gt(now)) {
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
        publishExpiration: permissions.includes(StreamPermission.PUBLISH) ? MaxInt256 : BigNumber.from(0),
        subscribeExpiration: permissions.includes(StreamPermission.SUBSCRIBE) ? MaxInt256 : BigNumber.from(0),
        canGrant: permissions.includes(StreamPermission.GRANT)
    }
}
