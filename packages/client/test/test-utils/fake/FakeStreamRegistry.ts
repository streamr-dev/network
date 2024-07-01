import { StreamID } from '@streamr/protocol'
import { EthereumAddress, Multimap, toEthereumAddress } from '@streamr/utils'
import { Methods } from '@streamr/test-utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../../../src/Authentication'
import { Stream, StreamMetadata } from '../../../src/Stream'
import { StreamFactory } from '../../../src/StreamFactory'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { StreamrClientError } from '../../../src/StreamrClientError'
import {
    PermissionAssignment,
    PermissionQuery, StreamPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery
} from '../../../src/permission'
import { StreamRegistry } from '../../../src/contracts/StreamRegistry'
import { SearchStreamsPermissionFilter } from '../../../src/contracts/searchStreams'
import { FakeChain, PUBLIC_PERMISSION_TARGET, PublicPermissionTarget, StreamRegistryItem } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamRegistry implements Methods<StreamRegistry> {

    private readonly chain: FakeChain
    private readonly streamFactory: StreamFactory
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly authentication: Authentication
    
    constructor(
        chain: FakeChain,
        streamFactory: StreamFactory,
        streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication
    ) {
        this.chain = chain
        this.streamFactory = streamFactory
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
    }

    async createStream(streamId: StreamID, metadata: StreamMetadata): Promise<Stream> {
        if (this.chain.getStream(streamId) !== undefined) {
            throw new Error(`Stream already exists: ${streamId}`)
        }
        const authenticatedUser: EthereumAddress = await this.authentication.getAddress()
        const permissions = new Multimap<EthereumAddress, StreamPermission>()
        permissions.addAll(authenticatedUser, Object.values(StreamPermission))
        const registryItem: StreamRegistryItem = {
            metadata,
            permissions
        }
        this.chain.setStream(streamId, registryItem)
        return this.streamFactory.createStream(streamId, metadata)
    }

    async getStream(id: StreamID): Promise<Stream> {
        const registryItem = this.chain.getStream(id)
        if (registryItem !== undefined) {
            return this.streamFactory.createStream(id, registryItem.metadata)
        } else {
            throw new StreamrClientError('Stream not found: id=' + id, 'STREAM_NOT_FOUND')
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async updateStream(streamId: StreamID, metadata: StreamMetadata): Promise<Stream> {
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            registryItem.metadata = metadata
        }
        return this.streamFactory.createStream(streamId, metadata)
    }

    async hasPermission(query: PermissionQuery): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(query.streamId)
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            return false
        }
        const targets: Array<EthereumAddress | PublicPermissionTarget> = []
        if (isPublicPermissionQuery(query) || query.allowPublic) {
            targets.push(PUBLIC_PERMISSION_TARGET)
        }
        if ((query as any).user !== undefined) {
            targets.push(toEthereumAddress((query as any).user))
        }
        return targets.some((target) => registryItem.permissions.get(target).includes(query.permission))
    }

    async getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
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
                    user: target,
                    permissions
                }
            }
        })
    }

    async grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (registryItem: StreamRegistryItem, target: EthereumAddress | PublicPermissionTarget, permissions: StreamPermission[]) => {
                const nonExistingPermissions = permissions.filter((p) => !registryItem.permissions.has(target, p))
                registryItem.permissions.addAll(target, nonExistingPermissions)
            }
        )
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (registryItem: StreamRegistryItem, target: EthereumAddress | PublicPermissionTarget, permissions: StreamPermission[]) => {
                registryItem.permissions.removeAll(target, permissions)
            }
        )
    }

    async updatePermissions(
        streamIdOrPath: string,
        assignments: PermissionAssignment[],
        modifyRegistryItem: (
            registryItem: StreamRegistryItem,
            target: EthereumAddress | PublicPermissionTarget,
            permissions: StreamPermission[]
        ) => void
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.chain.getStream(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            for (const assignment of assignments) {
                const target = isPublicPermissionAssignment(assignment)
                    ? PUBLIC_PERMISSION_TARGET
                    : toEthereumAddress(assignment.user)
                modifyRegistryItem(registryItem, target, assignment.permissions)
            }
        }
    }

    async setPermissions(...streams: {
        streamId: string
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        await Promise.all(streams.map(async (stream) => {
            await this.revokePermissions(stream.streamId, ...await this.getPermissions(stream.streamId))
            await this.grantPermissions(stream.streamId, ...stream.assignments)
        }))
    }

    hasPublicSubscribePermission(streamId: StreamID): Promise<boolean> {
        return this.hasPermission({
            streamId,
            public: true,
            permission: StreamPermission.SUBSCRIBE
        })
    }
    
    // eslint-disable-next-line class-methods-use-this
    clearStreamCache(): void {
        // no-op
    }

    async isStreamPublisher(streamIdOrPath: string, user: EthereumAddress): Promise<boolean> {
        return this.hasPermission({ streamId: streamIdOrPath, user, permission: StreamPermission.PUBLISH, allowPublic: true })
    }

    async isStreamSubscriber(streamIdOrPath: string, user: EthereumAddress): Promise<boolean> {
        return this.hasPermission({ streamId: streamIdOrPath, user, permission: StreamPermission.SUBSCRIBE, allowPublic: true })
    }

    // eslint-disable-next-line class-methods-use-this
    getOrCreateStream(_props: { id: string, partitions?: number }): Promise<Stream> {
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
    searchStreams(_term: string | undefined, _permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncIterable<Stream> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamPublishers(): AsyncIterable<EthereumAddress> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamSubscribers(): AsyncIterable<EthereumAddress> {
        throw new Error('not implemented')
    }
}
