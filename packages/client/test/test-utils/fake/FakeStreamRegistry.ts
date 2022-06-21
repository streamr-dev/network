import { inject, DependencyContainer, scoped, Lifecycle } from 'tsyringe'
import { EthereumAddress, KeyExchangeStreamIDUtils, StreamID } from 'streamr-client-protocol'
import { Stream, StreamProperties } from '../../../src/Stream'
import {
    StreamPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery,
    PermissionAssignment,
    PermissionQuery
} from '../../../src/permission'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { BrubeckContainer } from '../../../src/Container'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { NotFoundError, SearchStreamsPermissionFilter } from '../../../src'
import { Multimap } from '../Multimap'
import { StreamRegistryCached } from '../../../src/registry/StreamRegistryCached'
import { DOCKER_DEV_STORAGE_NODE } from '../../../src/ConfigTest'
import { formStorageNodeAssignmentStreamId } from '../../../src/utils/utils'
import { Authentication, AuthenticationInjectionToken } from '../../../src/Authentication'

type PublicPermissionTarget = 'public'
const PUBLIC_PERMISSION_TARGET: PublicPermissionTarget = 'public'

interface RegistryItem {
    metadata: Omit<StreamProperties, 'id'>
    permissions: Multimap<EthereumAddress|PublicPermissionTarget, StreamPermission>
}

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamRegistry implements Omit<StreamRegistry,
    'id' | 'debug' |
    'streamRegistryContract' | 'streamRegistryContractReadonly' |
    'chainProvider' |'chainSigner'> {

    private readonly registryItems: Map<StreamID, RegistryItem> = new Map()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly authentication: Authentication
    private readonly container: DependencyContainer
    private readonly streamRegistryCached: StreamRegistryCached

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        @inject(BrubeckContainer) container: DependencyContainer,
        @inject(StreamRegistryCached) streamRegistryCached: StreamRegistryCached
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
        this.container = container
        this.streamRegistryCached = streamRegistryCached
        const storageNodeAssignmentStreamPermissions = new Multimap<string,StreamPermission>()
        storageNodeAssignmentStreamPermissions.add(DOCKER_DEV_STORAGE_NODE.toLowerCase(), StreamPermission.PUBLISH)
        this.registryItems.set(formStorageNodeAssignmentStreamId(DOCKER_DEV_STORAGE_NODE), {
            metadata: {},
            permissions: storageNodeAssignmentStreamPermissions
        })
    }

    async createStream(propsOrStreamIdOrPath: StreamProperties | string): Promise<Stream> {
        if (!this.authentication.isAuthenticated()) {
            throw new Error('Not authenticated')
        }
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        props.partitions ??= 1
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        if (this.registryItems.has(streamId)) {
            throw new Error('Stream already exists')
        }
        const authenticatedUser: EthereumAddress = (await this.authentication.getAddress())!.toLowerCase()
        const permissions = new Multimap<EthereumAddress, StreamPermission>()
        permissions.addAll(authenticatedUser, Object.values(StreamPermission))
        const registryItem: RegistryItem = {
            metadata: props,
            permissions
        }
        this.registryItems.set(streamId, registryItem)
        return this.createFakeStream({
            ...props,
            id: streamId
        })
    }

    private createFakeStream = (props: StreamProperties & { id: StreamID}) => {
        const s = new Stream(props, this.container)
        return s
    }

    async getStream(id: StreamID): Promise<Stream> {
        if (KeyExchangeStreamIDUtils.isKeyExchangeStream(id)) {
            return new Stream({ id, partitions: 1 }, this.container)
        }
        const registryItem = this.registryItems.get(id)
        if (registryItem !== undefined) {
            return this.createFakeStream({ ...registryItem.metadata, id })
            // eslint-disable-next-line no-else-return
        } else {
            throw new NotFoundError('Stream not found: id=' + id)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async updateStream(props: StreamProperties): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            registryItem.metadata = props
        }
        return new Stream({
            ...props,
            id: streamId
        }, this.container)
    }

    /* eslint-disable padding-line-between-statements */
    async hasPermission(query: PermissionQuery): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(query.streamId)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            return false
        }
        const targets = []
        if (isPublicPermissionQuery(query) || query.allowPublic) {
            targets.push(PUBLIC_PERMISSION_TARGET)
        }
        if ((query as any).user !== undefined) {
            targets.push((query as any).user.toLowerCase())
        }
        return targets.some((target) => registryItem.permissions.get(target).includes(query.permission))
    }

    // eslint-disable-next-line class-methods-use-this
    async getPermissions(_streamIdOrPath: string): Promise<PermissionAssignment[]> {
        throw new Error('not implemented')
    }

    async grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (registryItem: RegistryItem, target: string, permissions: StreamPermission[]) => {
                registryItem.permissions.addAll(target, permissions)
            }
        )
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(
            streamIdOrPath,
            assignments,
            (registryItem: RegistryItem, target: string, permissions: StreamPermission[]) => {
                registryItem.permissions.removeAll(target, permissions)
            }
        )
    }

    async updatePermissions(
        streamIdOrPath: string,
        assignments: PermissionAssignment[],
        modifyRegistryItem: (registryItem: RegistryItem, target: string, permissions: StreamPermission[]) => void
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.streamRegistryCached.clearStream(streamId)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            for (const assignment of assignments) {
                const target = isPublicPermissionAssignment(assignment)
                    ? PUBLIC_PERMISSION_TARGET
                    : assignment.user.toLowerCase()
                modifyRegistryItem(registryItem, target, assignment.permissions)
            }
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async setPermissions(..._streams: {
        streamId: string,
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        throw new Error('not implemented')
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
    deleteStream(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllStreams(): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    searchStreams(_term: string | undefined, _permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamPublishers(_streamIdOrPath: string): AsyncGenerator<string, any, unknown> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamSubscribers(_streamIdOrPath: string): AsyncGenerator<string, any, unknown> {
        throw new Error('not implemented')
    }
}
