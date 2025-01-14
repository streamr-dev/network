import { Methods } from '@streamr/test-utils'
import { Multimap, StreamID, UserID } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../../../src/Authentication'
import { Stream } from '../../../src/Stream'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { StreamMetadata } from '../../../src/StreamMetadata'
import { StreamrClientError } from '../../../src/StreamrClientError'
import { StreamRegistry } from '../../../src/contracts/StreamRegistry'
import { InternalSearchStreamsPermissionFilter } from '../../../src/contracts/searchStreams'
import {
    InternalPermissionAssignment,
    InternalPermissionQuery,
    StreamPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery
} from '../../../src/permission'
import { FakeChain, PUBLIC_PERMISSION_TARGET, PublicPermissionTarget, StreamRegistryItem } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamRegistry implements Methods<StreamRegistry> {
    private readonly chain: FakeChain
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly authentication: Authentication

    constructor(
        chain: FakeChain,
        streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication
    ) {
        this.chain = chain
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
    }

    async createStream(streamId: StreamID, metadata: StreamMetadata): Promise<void> {
        if (this.chain.getStream(streamId) !== undefined) {
            throw new Error(`Stream already exists: ${streamId}`)
        }
        const authenticatedUser = await this.authentication.getUserId()
        const permissions = new Multimap<UserID, StreamPermission>()
        permissions.addAll(authenticatedUser, Object.values(StreamPermission))
        const registryItem: StreamRegistryItem = {
            metadata,
            permissions
        }
        this.chain.setStream(streamId, registryItem)
    }

    async getStreamMetadata(id: StreamID): Promise<StreamMetadata> {
        const registryItem = this.chain.getStream(id)
        if (registryItem !== undefined) {
            return registryItem.metadata
        } else {
            throw new StreamrClientError('Stream not found: id=' + id, 'STREAM_NOT_FOUND')
        }
    }

    async setStreamMetadata(streamId: StreamID, metadata: StreamMetadata): Promise<void> {
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            registryItem.metadata = metadata
        }
    }

    async hasPermission(query: InternalPermissionQuery): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(query.streamId)
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            return false
        }
        const targets: (UserID | PublicPermissionTarget)[] = []
        if (isPublicPermissionQuery(query) || query.allowPublic) {
            targets.push(PUBLIC_PERMISSION_TARGET)
        }
        if ('userId' in query) {
            targets.push(query.userId)
        }
        return targets.some((target) => registryItem.permissions.get(target).includes(query.permission))
    }

    async getPermissions(streamIdOrPath: string): Promise<InternalPermissionAssignment[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            return []
        }
        const targets = [...registryItem.permissions.keys()]
        return targets.map((target) => {
            const permissions = registryItem.permissions.get(target)
            if (target === PUBLIC_PERMISSION_TARGET) {
                return {
                    public: true,
                    permissions
                }
            } else {
                return {
                    userId: target,
                    permissions
                }
            }
        })
    }

    async grantPermissions(streamIdOrPath: string, ...assignments: InternalPermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (
                registryItem: StreamRegistryItem,
                target: UserID | PublicPermissionTarget,
                permissions: StreamPermission[]
            ) => {
                const nonExistingPermissions = permissions.filter((p) => !registryItem.permissions.has(target, p))
                registryItem.permissions.addAll(target, nonExistingPermissions)
            }
        )
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: InternalPermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (
                registryItem: StreamRegistryItem,
                target: UserID | PublicPermissionTarget,
                permissions: StreamPermission[]
            ) => {
                registryItem.permissions.removeAll(target, permissions)
            }
        )
    }

    async updatePermissions(
        streamIdOrPath: string,
        assignments: InternalPermissionAssignment[],
        modifyRegistryItem: (
            registryItem: StreamRegistryItem,
            target: UserID | PublicPermissionTarget,
            permissions: StreamPermission[]
        ) => void
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            for (const assignment of assignments) {
                const target = isPublicPermissionAssignment(assignment) ? PUBLIC_PERMISSION_TARGET : assignment.userId
                modifyRegistryItem(registryItem, target, assignment.permissions)
            }
        }
    }

    async setPermissions(
        ...streams: {
            streamId: string
            assignments: InternalPermissionAssignment[]
        }[]
    ): Promise<void> {
        await Promise.all(
            streams.map(async (stream) => {
                await this.revokePermissions(stream.streamId, ...(await this.getPermissions(stream.streamId)))
                await this.grantPermissions(stream.streamId, ...stream.assignments)
            })
        )
    }

    hasPublicSubscribePermission(streamId: StreamID): Promise<boolean> {
        return this.hasPermission({
            streamId,
            public: true,
            permission: StreamPermission.SUBSCRIBE
        })
    }

    // eslint-disable-next-line class-methods-use-this
    populateMetadataCache(): void {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    invalidatePermissionCaches(): void {
        // no-op
    }

    async isStreamPublisher(streamId: StreamID, userId: UserID): Promise<boolean> {
        return this.hasPermission({ streamId, userId, permission: StreamPermission.PUBLISH, allowPublic: true })
    }

    async isStreamSubscriber(streamId: StreamID, userId: UserID): Promise<boolean> {
        return this.hasPermission({ streamId, userId, permission: StreamPermission.SUBSCRIBE, allowPublic: true })
    }

    // eslint-disable-next-line class-methods-use-this
    getOrCreateStream(_props: { id: string; partitions?: number }): Promise<Stream> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    deleteStream(): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllStreams(): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    searchStreams(
        _term: string | undefined,
        _permissionFilter: InternalSearchStreamsPermissionFilter | undefined
    ): AsyncGenerator<StreamID> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamPublishers(): AsyncIterable<UserID> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamSubscribers(): AsyncIterable<UserID> {
        throw new Error('not implemented')
    }
}
