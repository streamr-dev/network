import { inject, DependencyContainer, scoped, Lifecycle } from 'tsyringe'
import { EthereumAddress, StreamID, StreamIDUtils } from 'streamr-client-protocol'
import { Stream, StreamPermission, StreamPermissions, StreamProperties } from '../../../src/Stream'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { BrubeckContainer } from '../../../src/Container'
import Ethereum from '../../../src/Ethereum'
import { NotFoundError } from '../../../src/authFetch'
import { PUBLIC_PERMISSION_ADDRESS, StreamRegistry } from '../../../src/StreamRegistry'
import { SearchStreamsPermissionFilter } from '../../../src'
import { Multimap } from '../utils'

interface RegistryItem {
    metadata: Omit<StreamProperties, 'id'>
    permissions: Multimap<EthereumAddress, StreamPermission>
}

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamRegistry implements Omit<StreamRegistry,
    'id' | 'debug' |
    'streamRegistryContract' | 'streamRegistryContractReadonly' |
    'chainProvider' |'chainSigner'> {

    private readonly registryItems: Map<StreamID, RegistryItem> = new Map()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly ethereum: Ethereum
    private readonly container: DependencyContainer

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(Ethereum) ethereum: Ethereum,
        @inject(BrubeckContainer) container: DependencyContainer
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.ethereum = ethereum
        this.container = container
    }

    async createStream(propsOrStreamIdOrPath: StreamProperties | string) {
        if (!this.ethereum.isAuthenticated()) {
            throw new Error('Not authenticated')
        }
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        props.partitions ??= 1
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        if (this.registryItems.has(streamId)) {
            throw new Error('Stream already exists')
        }
        const authenticatedUser: EthereumAddress = (await this.ethereum.getAddress())!.toLowerCase()
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
        // TODO check that there is a storage assignment (if not, this promise should timeout)
        s.waitUntilStorageAssigned = () => Promise.resolve()
        return s
    }

    async getStream(id: StreamID): Promise<Stream> {
        if (StreamIDUtils.isKeyExchangeStream(id)) {
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

    async streamExistsOnTheGraph(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.registryItems.has(streamId)
    }

    async grantPermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            const userKey = receivingUser.toLowerCase()
            registryItem.permissions.add(userKey, permission)
        }
    }

    async revokePermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            const userKey = receivingUser.toLowerCase()
            registryItem.permissions.remove(userKey, permission)
        }
    }

    async hasPermission(streamIdOrPath: string, userAddress: EthereumAddress, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            const userKey = userAddress.toLowerCase()
            return registryItem.permissions.has(userKey, permission)
        }
    }

    async isStreamPublisher(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        return this.hasPermission(streamIdOrPath, userAddress, StreamPermission.PUBLISH)
    }

    async isStreamSubscriber(streamIdOrPath: string, userAddress: EthereumAddress) {
        return this.hasPermission(streamIdOrPath, userAddress, StreamPermission.SUBSCRIBE)
    }

    async grantPublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        return this.grantPermission(streamIdOrPath, permission, PUBLIC_PERMISSION_ADDRESS)
    }

    async hasPublicPermission(streamIdOrPath: string, permission: StreamPermission): Promise<boolean> {
        return this.hasPermission(streamIdOrPath, PUBLIC_PERMISSION_ADDRESS, permission)
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamFromContract(_streamIdOrPath: string): Promise<Stream> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    hasDirectPermission(_streamIdOrPath: string, _userAddess: string, _permission: StreamPermission): Promise<boolean> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getPermissionsForUser(_streamIdOrPath: string, _userAddress?: string): Promise<StreamPermissions> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    updateStream(_props: StreamProperties): Promise<Stream> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    setPermissionsForUser(
        _streamIdOrPath: string,
        _receivingUser: string,
        _edit: boolean,
        _deletePermission: boolean,
        _publish: boolean,
        _subscribe: boolean,
        _share: boolean
    ): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    setPermissions(_streamIdOrPath: string, _users: string[], _permissions: StreamPermissions[]): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    revokeAllMyPermission(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    revokeAllUserPermission(_streamIdOrPath: string, _userId: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    revokePublicPermission(_streamIdOrPath: string, _permission: StreamPermission): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    revokeAllPublicPermissions(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    deleteStream(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    streamExistsOnChain(_streamIdOrPath: string): Promise<boolean> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamFromGraph(_streamIdOrPath: string): Promise<Stream> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllStreams(): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllPermissionsForStream(_streamIdOrPath: string): Promise<Record<string, StreamPermission[]>> {
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
