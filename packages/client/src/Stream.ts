/**
 * Wrapper for Stream metadata and (some) methods.
 */
import fetch from 'node-fetch'
import { StreamMetadata } from 'streamr-client-protocol/dist/src/utils/StreamMessageValidator'
import { SPID, SID } from 'streamr-client-protocol'
import { DependencyContainer, inject } from 'tsyringe'

export { GroupKey } from './encryption/Encryption'
import { EthereumAddress } from './types'
import { until, pLimitFn } from './utils'

import { Rest } from './Rest'
import Resends from './Resends'
import Publisher from './Publisher'
import { BigNumber } from '@ethersproject/bignumber'
import { StreamRegistry } from './StreamRegistry'
import Ethereum from './Ethereum'
import { NodeRegistry } from './NodeRegistry'
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { StorageNode } from './StorageNode'
import { until } from './utils'

// TODO explicit types: e.g. we never provide both streamId and id, or both streamPartition and partition
export type StreamPartDefinitionOptions = {
    streamId?: string,
    streamPartition?: number,
    id?: string,
    partition?: number,
    stream?: StreamrStream|string
}

export type StreamPartDefinition = string | StreamPartDefinitionOptions

export type ValidatedStreamPartDefinition = { streamId: string, streamPartition: number, key: string}

export interface StreamPermission {
    streamId: string
    userAddress: string
    edit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    share: boolean
}

export enum StreamOperation {
    // STREAM_GET = 'stream_get',
    STREAM_EDIT = 'edit',
    STREAM_DELETE = 'canDelete',
    STREAM_PUBLISH = 'publishExpiration',
    STREAM_SUBSCRIBE = 'subscribeExpiration',
    STREAM_SHARE = 'share'
}

export interface StreamProperties {
    id: string
    name?: string
    description?: string
    config?: {
        fields: Field[];
    }
    partitions?: number
    requireSignedData?: boolean
    requireEncryptedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number
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
    streamId: string
    id: string
    // @ts-expect-error
    name: string
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions!: number
    /** @internal */
    requireEncryptedData!: boolean
    requireSignedData!: boolean
    storageDays?: number
    inactivityThresholdHours?: number
    protected _rest: Rest
    protected _resends: Resends
    protected _publisher: Publisher
    protected _streamEndpoints: StreamEndpoints
    protected _streamEndpointsCached: StreamEndpointsCached
    protected _streamRegistry: StreamRegistry
    protected _nodeRegistry: NodeRegistry
    protected _ethereuem: Ethereum

    constructor(
        props: StreamProperties,
        @inject(BrubeckContainer) private _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.streamId = this.id
        this.partitions = props.partitions ? props.partitions : 1
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        this._streamRegistry = _container.resolve<StreamRegistry>(StreamRegistry)
        this._nodeRegistry = _container.resolve<NodeRegistry>(NodeRegistry)
        this._ethereuem = _container.resolve<Ethereum>(Ethereum)
    }

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

    async hasUserPermission(operation: StreamOperation, userId: string) {
        this.assertUserId(userId)
        return this.hasPermission(operation, userId)
    }

    async hasPublicPermission(operation: StreamOperation) {
        return this.hasPermission(operation, undefined)
    }

    async hasUserPermissions(operations: StreamOperation[], userId: string) {
        this.assertUserId(userId)
        return this.hasPermissions(operations, userId)
    }

    async hasPublicPermissions(operations: StreamOperation[]) {
        return this.hasPermissions(operations, undefined)
    }

    async hasPermissions(operations: StreamOperation[], userId: string|undefined) {
        this.assertUserIdOrPublic(userId)

        const matchingPermissions = await this.getMatchingPermissions(operations, userId)
        if (!matchingPermissions.length) { return undefined }
        return matchingPermissions
    }

    async hasPermission(operation: StreamOperation, userId: string|undefined) {
        const permissions = await this.hasPermissions([operation], userId)
        if (!Array.isArray(permissions) || !permissions.length) { return undefined }
        return permissions[0]
    }

    async grantUserPermission(operation: StreamOperation, userId: string) {
        this.assertUserId(userId)

        return this.grantPermission(operation, userId)
    }

    async grantPublicPermission(operation: StreamOperation) {
        return this.grantPermission(operation, undefined)
    }

    async grantUserPermissions(operations: StreamOperation[], userId: string) {
        this.assertUserId(userId)
        return this.grantPermissions(operations, userId)
    }

    async grantPublicPermissions(operations: StreamOperation[]) {
        return this.grantPermissions(operations, undefined)
    }

    async grantPermissions(operations: StreamOperation[], userId: string|undefined) {
        this.assertUserIdOrPublic(userId)
        const tasks = operations.map(async (operation) => {
            return this.grantPermission(operation, userId)
        })
        await Promise.allSettled(tasks)
        return Promise.all(tasks)
    }

    async grantPermission(operation: StreamOperation, userId: string|undefined) {
        this.assertUserIdOrPublic(userId)

        try {
            const existingPermission = await this.hasPermission(operation, userId)
            if (existingPermission) {
                return existingPermission
            }

            const permissionObject: any = {
                operation,
            }

            const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined

            if (userIdCaseInsensitive !== undefined) {
                permissionObject.user = userIdCaseInsensitive
            } else {
                permissionObject.anonymous = true
            }

            return await this._rest.post<StreamPermision>(
                ['streams', this.id, 'permissions'],
                permissionObject
            )
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async revokeUserPermission(operation: StreamOperation, userId: string) {
        this.assertUserId(userId)
        return this.revokeMatchingPermissions([operation], userId)
    }

    async revokePublicPermission(operation: StreamOperation) {
        return this.revokeMatchingPermissions([operation], undefined)
    }

    async revokeUserPermissions(operations: StreamOperation[], userId: string) {
        this.assertUserId(userId)
        return this.revokePermissions(operations, userId)
    }

    async revokePublicPermissions(operations: StreamOperation[]) {
        return this.revokePermissions(operations, undefined)
    }

    async revokePermissions(operations: StreamOperation[], userId: string|undefined) {
        this.assertUserIdOrPublic(userId)
        const permissions = await this.getMatchingPermissions(operations, userId)
        const tasks = permissions.map(async (p) => {
            return this.revokePermission(p.id)
        })
        await Promise.allSettled(tasks)
        return Promise.all(tasks)
    }

    async getUserPermissions(userId: string) {
        this.assertUserId(userId)
        return this.getMatchingPermissions(false, userId)
    }

    async getPublicPermissions() {
        return this.getMatchingPermissions(false, undefined)
    }

    async getMatchingPermissions(operations: StreamOperation[]|false, userId: string|undefined|false): Promise<StreamPermision[]> {
        if (operations && !operations.length) { return [] }

        if (userId !== false) {
            this.assertUserIdOrPublic(userId)
        }

        const permissions = await this.getPermissions()
        // eth addresses may be in checksumcase, but userId from server has no case
        const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const operationSet = new Set<StreamOperation>(operations === false ? [] : operations)
        return permissions.filter((p) => {
            if (operations !== false) {
                if (!operationSet.has(p.operation)) {
                    return false
                }
            }

            if (userId !== false) {
                if (userIdCaseInsensitive === undefined) {
                    return !!('anonymous' in p && p.anonymous) // match nullish userId against p.anonymous
                }
                return 'user' in p && p.user && p.user.toLowerCase() === userIdCaseInsensitive // match against userId
            }

            return true
        })
    }

    async revokeMatchingPermissions(operations: StreamOperation[], userId: string|undefined) {
        this.assertUserIdOrPublic(userId)
        const matchingPermissions = await this.getMatchingPermissions(operations, userId)

        const tasks = matchingPermissions.map(async (p: any) => {
            await this.revokePermission(p.id)
        })
        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    }

    async revokeAllUserPermissions(userId: string) {
        this.assertUserId(userId)
        return this.revokeAllPermissions(userId)
    }

    async revokeAllPublicPermissions() {
        return this.revokeAllPermissions(undefined)
    }

    protected async revokeAllPermissions(userId: string|undefined) {
        this.assertUserIdOrPublic(userId)

        const matchingPermissions = await this.getMatchingPermissions(false, userId)
        const tasks = matchingPermissions.map(async (p: any) => {
            await this.revokePermission(p.id)
        })
        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    }

    async revokePermission(permissionId: number) {
        if (!Number.isSafeInteger(permissionId) || permissionId < 0) {
            throw new Error(`Invalid permissionId: ${permissionId}`)
        }

        try {
            this._streamEndpointsCached.clearStream(this.id)
            return await this._rest.del<StreamPermision>(
                ['streams', this.id, 'permissions', String(permissionId)],
            )
        } catch (err: any) {
            if (err.code === 'NOT_FOUND') { return Promise.resolve() } // ok if not found
            throw err
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.resend({
            streamId: this.id,
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

    async revokePublicPermission(operation: StreamOperation) {
        try {
            await this._streamRegistry.revokePublicPermission(this.id, operation)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async addToStorageNode(node: StorageNode | EthereumAddress, waitOptions: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        try {
            let address: string
            let url
            if (node instanceof StorageNode) {
                address = node.getAddress()
                url = node.url
            } else {
                address = node
                const storageNode = await this._nodeRegistry.getStorageNode(address)
                url = storageNode.url
            }
            await this._nodeRegistry.addStreamToStorageNode(this.id, address)
            await this.waitUntilStorageAssigned(waitOptions, url)
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

    private static async isStreamStoredInStorageNode(streamId: string, nodeurl: string) {
        const url = `${nodeurl}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/0`
        const response = await fetch(url)
        if (response.status === 200) {
            return true
        }
        if (response.status === 404) { // eslint-disable-line padding-line-between-statements
            return false
        }
        throw new Error(`Unexpected response code ${response.status} when fetching stream storage status`)
    }

    async removeFromStorageNode(node: StorageNode | EthereumAddress) {
        try {
            const address = (node instanceof StorageNode) ? node.getAddress() : node
            return this._nodeRegistry.removeStreamFromStorageNode(this.id, address)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    // private async isStreamStoredInStorageNode(node: StorageNode | EthereumAddress) {
    //     const address = (node instanceof StorageNode) ? node.getAddress() : node
    //     return this._nodeRegistry.isStreamStoredInStorageNode(this.id, address)
    // }

    async getStorageNodes() {
        return this._nodeRegistry.getStorageNodesOf(this.id)
    }

    async publish<T>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
    }

    static parseStreamPropsFromJson(propsString: string): StreamProperties {
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
