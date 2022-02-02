/**
 * Wrapper for Stream metadata and (some) methods.
 */
import fetch from 'node-fetch'
import { DependencyContainer, inject } from 'tsyringe'

export { GroupKey } from './encryption/Encryption'
import { until } from './utils'

import { Rest } from './Rest'
import Resends from './Resends'
import Publisher from './Publisher'
import { StreamRegistry } from './StreamRegistry'
import Ethereum from './Ethereum'
import { StorageNodeRegistry } from './StorageNodeRegistry'
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { AddressZero } from '@ethersproject/constants'
import { EthereumAddress, StreamID, StreamMetadata } from 'streamr-client-protocol'
import { DEFAULT_PARTITION } from './StreamIDBuilder'

export interface StreamPermissions {
    canEdit: boolean
    canDelete: boolean
    canPublish: boolean // BigNumber to have expiring permissions
    canSubscribe: boolean // BigNumber to have expiring permissions
    canGrant: boolean
}

export enum StreamPermission {
    EDIT = 'canEdit',
    DELETE = 'canDelete',
    PUBLISH = 'canPublish',
    SUBSCRIBE = 'canSubscribe',
    GRANT = 'canGrant'
}

export interface StreamProperties {
    id: string
    description?: string
    config?: {
        fields: Field[];
    }
    partitions?: number
    requireSignedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number
}

export interface StreamrStreamConstructorOptions extends StreamProperties {
    id: StreamID
}

const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

export type Field = {
    name: string;
    type: typeof VALID_FIELD_TYPES[number];
}

function getFieldType(value: any): (Field['type'] | undefined) {
    const type = typeof value
    switch (true) {
        case Array.isArray(value): {
            return 'list'
        }
        case type === 'object': {
            return 'map'
        }
        case (VALID_FIELD_TYPES as ReadonlyArray<string>).includes(type): {
            // see https://github.com/microsoft/TypeScript/issues/36275
            return type as Field['type']
        }
        default: {
            return undefined
        }
    }
}

class StreamrStream implements StreamMetadata {
    id: StreamID
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions!: number
    requireSignedData!: boolean
    storageDays?: number
    inactivityThresholdHours?: number
    protected _rest: Rest
    protected _resends: Resends
    protected _publisher: Publisher
    protected _streamEndpoints: StreamEndpoints
    protected _streamEndpointsCached: StreamEndpointsCached
    protected _streamRegistry: StreamRegistry
    protected _nodeRegistry: StorageNodeRegistry
    protected _ethereuem: Ethereum

    /** @internal */
    constructor(
        props: StreamrStreamConstructorOptions,
        @inject(BrubeckContainer) private _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.partitions = props.partitions ? props.partitions : 1
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        this._streamRegistry = _container.resolve<StreamRegistry>(StreamRegistry)
        this._nodeRegistry = _container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this._ethereuem = _container.resolve<Ethereum>(Ethereum)
    }

    /**
     * Persist stream metadata updates.
     */
    async update() {
        try {
            await this._streamRegistry.updateStream(this.toObject())
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    toObject() : StreamProperties {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (key.startsWith('_') || typeof key === 'function') { return }
            // @ts-expect-error
            result[key] = this[key]
        })
        return result as StreamProperties
    }

    async delete() {
        try {
            await this._streamRegistry.deleteStream(this.id)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async getPermissions() {
        return this._streamRegistry.getAllPermissionsForStream(this.id)
    }

    async getMyPermissions() {
        return this._streamRegistry.getPermissionsForUser(this.id, await this._ethereuem.getAddress())
    }

    async getUserPermissions(userId: EthereumAddress) {
        return this._streamRegistry.getPermissionsForUser(this.id, userId)
    }

    async getPublicPermissions() {
        return this._streamRegistry.getPermissionsForUser(this.id, AddressZero)
    }

    // eslint-disable-next-line class-methods-use-this
    assertUserId(userId: string) {
        if (!userId || typeof userId !== 'string') {
            throw new Error(`Invalid UserId: ${userId}`)
        }
    }

    assertUserIdOrPublic(userId: string | undefined) {
        if (typeof userId === 'string') {
            this.assertUserId(userId)
            return
        }

        if (userId != null) {
            throw new Error(`Invalid UserId: ${userId}`)
        }
    }

    async hasUserPermission(permission: StreamPermission, userId: string) {
        this.assertUserId(userId)
        return this._streamRegistry.hasPermission(this.id, userId, permission)
    }

    async hasPublicPermission(permission: StreamPermission) {
        return this._streamRegistry.hasPublicPermission(this.id, permission)
    }

    // async hasUserPermissions(operations: StreamPermission[], userId: string) {
    //     this.assertUserId(userId)
    //     const permissions = this._streamRegistry.getPermissionsForUser(this.id, userId, )
    //     return this.hasPermissions(operations, userId)
    // }
    // async hasPermissions(operations: StreamPermission[], userId: string) {
    //     const permissions = await this._streamRegistry.getPermissionsForUser(this.id, userId)

    //     if (operation === StreamPermission.PUBLISH || operation === StreamPermission.SUBSCRIBE) {
    //         return permissions[operation].gt(Date.now())
    //     }
    //     return permissions[operation]
    // }

    // async hasPermission(operation: StreamPermission, userId: string|undefined) {
    //     const permissions = await this.hasPermissions([operation], userId)
    //     if (!Array.isArray(permissions) || !permissions.length) { return undefined }
    //     return permissions[0]
    // }

    async grantUserPermission(permission: StreamPermission, userId: string) {
        try {
            await this._streamRegistry.grantPermission(this.id, permission, userId)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    // private async grantUserPermissions(permissions: StreamPermissions, userId: string) {
    //     this.assertUserIdOrPublic(userId)
    //     try {
    //         await this.setPermissions(userId, permissions.edit, permissions.canDelete,
    //             permissions.publishExpiration, permissions.subscribeExpiration, permissions.share)
    //     } finally {
    //         this._streamEndpointsCached.clearStream(this.id)
    //     }
    // }

    async grantPublicPermission(permission: StreamPermission) {
        try {
            await this._streamRegistry.grantPublicPermission(this.id, permission)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async revokeUserPermission(permission: StreamPermission, userId: string) {
        this.assertUserId(userId)
        try {
            return this._streamRegistry.revokePermission(this.id, permission, userId)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async revokePublicPermission(permission: StreamPermission) {
        try {
            return this._streamRegistry.revokePublicPermission(this.id, permission)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    // async getMatchingPermissions(operations: StreamPermission[]|false, userId: string|undefined|false): Promise<StreamPermision[]> {
    //     if (operations && !operations.length) { return [] }

    //     if (userId !== false) {
    //         this.assertUserIdOrPublic(userId)
    //     }

    //     const permissions = await this.getPermissions()
    //     // eth addresses may be in checksumcase, but userId from server has no case
    //     const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
    //     const operationSet = new Set<StreamPermission>(operations === false ? [] : operations)
    //     return permissions.filter((p) => {
    //         if (operations !== false) {
    //             if (!operationSet.has(p.operation)) {
    //                 return false
    //             }
    //         }

    //         if (userId !== false) {
    //             if (userIdCaseInsensitive === undefined) {
    //                 return !!('anonymous' in p && p.anonymous) // match nullish userId against p.anonymous
    //             }
    //             return 'user' in p && p.user && p.user.toLowerCase() === userIdCaseInsensitive // match against userId
    //         }

    //         return true
    //     })
    // }

    // async revokeMatchingPermissions(operations: StreamPermission[], userId: string|undefined) {
    //     this.assertUserIdOrPublic(userId)
    //     const matchingPermissions = await this.getMatchingPermissions(operations, userId)

    //     const tasks = matchingPermissions.map(async (p: any) => {
    //         await this.revokePermission(p.id)
    //     })
    //     await Promise.allSettled(tasks)
    //     await Promise.all(tasks)
    // }

    async revokeAllUserPermissions(userId: string) {
        this.assertUserId(userId)
        try {
            return this._streamRegistry.revokeAllUserPermission(this.id, userId)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async revokeAllPublicPermissions() {
        try {
            return this._streamRegistry.revokeAllPublicPermissions(this.id)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async setPermissionsForUser(recipientId: EthereumAddress, edit: boolean,
        deletePerm: boolean, publish: boolean, subscribe: boolean, share: boolean) {
        try {
            await this._streamRegistry.setPermissionsForUser(this.id, recipientId, edit,
                deletePerm, publish, subscribe, share)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async setPermissions(recipientIds: EthereumAddress[], permissions: StreamPermissions[]) {
        try {
            await this._streamRegistry.setPermissions(this.id, recipientIds, permissions)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.resend({
            id: this.id,
            resend: {
                last: 1,
            },
        })

        const receivedMsgs = await sub.collectContent()

        if (!receivedMsgs.length) { return }

        const [lastMessage] = receivedMsgs

        const fields = Object.entries(lastMessage).map(([name, value]) => {
            const type = getFieldType(value)
            return !!type && {
                name,
                type,
            }
        }).filter(Boolean) as Field[] // see https://github.com/microsoft/TypeScript/issues/30621

        // Save field config back to the stream
        this.config.fields = fields
        await this.update()
    }

    async addToStorageNode(nodeAddress: EthereumAddress, waitOptions: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        try {
            const storageNodeUrl = await this._nodeRegistry.getStorageNodeUrl(nodeAddress)
            await this._nodeRegistry.addStreamToStorageNode(this.id, nodeAddress)
            await this.waitUntilStorageAssigned(waitOptions, storageNodeUrl)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async waitUntilStorageAssigned({
        timeout = 30000,
        pollInterval = 500
    }: {
        timeout?: number,
        pollInterval?: number
    } = {}, url: string) {
        // wait for propagation: the storage node sees the database change in E&E and
        // is ready to store the any stream data which we publish
        await until(() => StreamrStream.isStreamStoredInStorageNode(this.id, url), timeout, pollInterval, () => (
            `Propagation timeout when adding stream to a storage node: ${this.id}`
        ))
    }

    private static async isStreamStoredInStorageNode(streamId: StreamID, nodeurl: string) {
        const url = `${nodeurl}/streams/${encodeURIComponent(streamId)}/storage/partitions/${DEFAULT_PARTITION}`
        const response = await fetch(url)
        if (response.status === 200) {
            return true
        }
        if (response.status === 404) { // eslint-disable-line padding-line-between-statements
            return false
        }
        throw new Error(`Unexpected response code ${response.status} when fetching stream storage status`)
    }

    async removeFromStorageNode(nodeAddress: EthereumAddress) {
        try {
            return this._nodeRegistry.removeStreamFromStorageNode(this.id, nodeAddress)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async getStorageNodes() {
        return this._nodeRegistry.getStorageNodesOf(this.id)
    }

    async publish<T>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
    }

    /** @internal */
    static parsePropertiesFromMetadata(propsString: string): StreamProperties {
        try {
            return JSON.parse(propsString)
        } catch (error) {
            throw new Error(`Could not parse properties from onchain metadata: ${propsString}`)
        }
    }
}

export {
    StreamrStream as Stream
}
