import { without } from 'lodash'
import { inject, DependencyContainer, scoped, Lifecycle } from 'tsyringe'
import { EthereumAddress, StreamID, StreamIDUtils } from 'streamr-client-protocol'
import { Stream, StreamPermission, StreamPermissions, StreamProperties } from '../../../src/Stream'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { BrubeckContainer } from '../../../src/Container'
import Ethereum from '../../../src/Ethereum'
import { NotFoundError } from '../../../src/authFetch'
import { PUBLIC_PERMISSION_ADDRESS, StreamRegistry } from '../../../src/StreamRegistry'
import { SearchStreamsPermissionFilter } from '../../../src'

interface RegistryItem {
    metadata: Omit<StreamProperties, 'id'>
    permissions: Map<EthereumAddress, StreamPermission[]>
}

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamRegistry implements Omit<StreamRegistry,
    'id' | 'debug' |
    'streamRegistryContract' | 'streamRegistryContractReadonly' |
    'chainProvider' |'chainSigner'> {

    private registryItems: Map<StreamID, RegistryItem> = new Map()
    private streamIdBuilder: StreamIDBuilder
    private ethereum: Ethereum
    private container: DependencyContainer

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(Ethereum) ethereum: Ethereum,
        @inject(BrubeckContainer) container: DependencyContainer
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.ethereum = ethereum
        this.container = container
    }

    async createStream(propsOrStreamIdOrPath: StreamProperties) {
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
        const permissions = new Map()
        permissions.set(authenticatedUser, Object.values(StreamPermission))
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
            if (!registryItem.permissions.has(receivingUser)) {
                registryItem.permissions.set(userKey, [])
            }
            registryItem.permissions.get(userKey)!.push(permission)
        }
    }

    async revokePermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            const userKey = receivingUser.toLowerCase()
            if (registryItem.permissions.has(receivingUser)) {
                const newPermissions = without(registryItem.permissions.get(userKey), permission)
                registryItem.permissions.set(userKey, newPermissions)
            }
        }
    }

    async hasPermission(streamIdOrPath: string, userAddress: EthereumAddress, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const registryItem = this.registryItems.get(streamId)
        if (registryItem === undefined) {
            throw new Error('Stream not found')
        } else {
            const userKey = userAddress.toLowerCase()
            return (registryItem.permissions !== undefined)
                && (registryItem.permissions.get(userKey) !== undefined)
                && registryItem.permissions.get(userKey)!.includes(permission)
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

    getStreamFromContract(_streamIdOrPath: string): Promise<Stream> {
        throw new Error('not implemented')
    }

    hasDirectPermission(_streamIdOrPath: string, _userAddess: string, _permission: StreamPermission): Promise<boolean> {
        throw new Error('not implemented')
    }

    getPermissionsForUser(_streamIdOrPath: string, _userAddress?: string): Promise<StreamPermissions> {
        throw new Error('not implemented')
    }

    updateStream(_props: StreamProperties): Promise<Stream> {
        throw new Error('not implemented')
    }

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

    setPermissions(_streamIdOrPath: string, _users: string[], _permissions: StreamPermissions[]): Promise<void> {
        throw new Error('not implemented')
    }

    revokeAllMyPermission(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    revokeAllUserPermission(_streamIdOrPath: string, _userId: string): Promise<void> {
        throw new Error('not implemented')
    }

    revokePublicPermission(_streamIdOrPath: string, _permission: StreamPermission): Promise<void> {
        throw new Error('not implemented')
    }

    revokeAllPublicPermissions(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    deleteStream(_streamIdOrPath: string): Promise<void> {
        throw new Error('not implemented')
    }

    streamExistsOnChain(_streamIdOrPath: string): Promise<boolean> {
        throw new Error('not implemented')
    }

    getStreamFromGraph(_streamIdOrPath: string): Promise<Stream> {
        throw new Error('not implemented')
    }

    getAllStreams(): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    getAllPermissionsForStream(_streamIdOrPath: string): Promise<Record<string, StreamPermission[]>> {
        throw new Error('not implemented')
    }

    searchStreams(_term: string | undefined, _permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncGenerator<Stream, any, unknown> {
        throw new Error('not implemented')
    }

    getStreamPublishers(_streamIdOrPath: string): AsyncGenerator<string, any, unknown> {
        throw new Error('not implemented')
    }

    getStreamSubscribers(_streamIdOrPath: string): AsyncGenerator<string, any, unknown> {
        throw new Error('not implemented')
    }
}
