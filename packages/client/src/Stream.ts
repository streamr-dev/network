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
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'

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

interface StreamPermisionBase {
    id: number
    operation: StreamOperation
}

export interface UserStreamPermission extends StreamPermisionBase {
    user: string
}

export interface AnonymousStreamPermisson extends StreamPermisionBase {
    anonymous: true
}

export type StreamPermision = UserStreamPermission | AnonymousStreamPermisson

export enum StreamOperation {
    STREAM_GET = 'stream_get',
    STREAM_EDIT = 'stream_edit',
    STREAM_DELETE = 'stream_delete',
    STREAM_PUBLISH = 'stream_publish',
    STREAM_SUBSCRIBE = 'stream_subscribe',
    STREAM_SHARE = 'stream_share'
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

    constructor(
        props: StreamProperties,
        @inject(BrubeckContainer) private _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.streamId = this.id
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        // try prevent mysql race conditions in core-api when creating or removing permissions in parallel
        this.grantPermission = pLimitFn(this.grantPermission.bind(this))
        this.revokePermission = pLimitFn(this.revokePermission.bind(this))
    }

    async update() {
        try {
            const json = await this._rest.put<StreamProperties>(
                ['streams', this.id],
                this.toObject(),
            )
            return json ? new StreamrStream(json, this._container) : undefined
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    toObject() {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (key.startsWith('_') || typeof key === 'function') { return }
            // @ts-expect-error
            result[key] = this[key]
        })
        return result
    }

    async delete() {
        try {
            await this._rest.del(
                ['streams', this.id],
            )
        } catch (err: any) {
            if (err.code === 'NOT_FOUND') { return } // ok if not found
            throw err
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async getPermissions() {
        return this._rest.get<StreamPermision[]>(
            ['streams', this.id, 'permissions'],
        )
    }

    async getMyPermissions() {
        return this._rest.get<StreamPermision[]>(
            ['streams', this.id, 'permissions', 'me'],
        )
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

    async addToStorageNode(address: EthereumAddress, waitOptions: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        await this._rest.post(
            ['streams', this.id, 'storageNodes'],
            { address }
        )
        await this.waitUntilStorageAssigned(waitOptions)
    }

    async waitUntilStorageAssigned({
        timeout = 30000,
        pollInterval = 500
    }: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        // wait for propagation: the storage node sees the database change in E&E and
        // is ready to store the any stream data which we publish
        await until(() => this.isStreamStoredInStorageNode(this.id), timeout, pollInterval, () => (
            `Propagation timeout when adding stream to a storage node: ${this.id}`
        ))
    }

    private async isStreamStoredInStorageNode(streamId: string) {
        const sid: SID = SPID.parse(streamId)
        const nodes = await this._streamEndpoints.getStorageNodes(sid)
        if (!nodes.length) { return false }
        const url = `${nodes[0].url}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/0`
        const response = await fetch(url)
        if (response.status === 200) {
            return true
        }
        if (response.status === 404) { // eslint-disable-line padding-line-between-statements
            return false
        }
        throw new Error(`Unexpected response code ${response.status} when fetching stream storage status`)
    }

    async removeFromStorageNode(address: EthereumAddress) {
        await this._rest.del<{ storageNodeAddress: string}[] >(
            ['streams', this.id, 'storageNodes', address]
        )
    }

    async getStorageNodes() {
        return this._streamEndpoints.getStorageNodes(this.id)
    }

    async publish<T>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
    }
}

export {
    StreamrStream as Stream
}
