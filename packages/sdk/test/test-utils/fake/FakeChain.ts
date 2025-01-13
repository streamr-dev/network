import { EthereumAddress, Multimap, StreamID, UserID } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { StreamMetadata } from '../../../src/StreamMetadata'
import { StorageNodeMetadata } from '../../../src/contracts/StorageNodeRegistry'
import { StreamPermission } from '../../../src/permission'

export type PublicPermissionTarget = 'public'
export const PUBLIC_PERMISSION_TARGET: PublicPermissionTarget = 'public'

export interface StreamRegistryItem {
    metadata: StreamMetadata
    permissions: Multimap<UserID | PublicPermissionTarget, StreamPermission>
}

export interface FakeStorageNodeAssignmentEvent {
    readonly streamId: StreamID
    readonly nodeAddress: EthereumAddress
}

export interface Events {
    streamAddedToStorageNode: (payload: FakeStorageNodeAssignmentEvent) => void
}

export class FakeChain {
    private readonly streams: Map<StreamID, StreamRegistryItem> = new Map()
    private readonly storageAssignments: Multimap<StreamID, EthereumAddress> = new Multimap()
    private readonly storageNodeMetadatas: Map<EthereumAddress, StorageNodeMetadata> = new Map()
    private readonly erc1271AllowedAddresses: Multimap<EthereumAddress, UserID> = new Multimap()
    private readonly eventEmitter = new EventEmitter<Events>()

    getStream(streamId: StreamID): StreamRegistryItem | undefined {
        return this.streams.get(streamId)
    }

    setStream(streamId: StreamID, registryItem: StreamRegistryItem): void {
        this.streams.set(streamId, registryItem)
    }

    getStorageAssignments(streamId: StreamID): EthereumAddress[] {
        return this.storageAssignments.get(streamId)
    }

    addStorageAssignment(streamId: StreamID, nodeAddress: EthereumAddress): void {
        const existedBefore = this.storageAssignments.has(streamId, nodeAddress)
        this.storageAssignments.add(streamId, nodeAddress)
        if (!existedBefore) {
            this.eventEmitter.emit('streamAddedToStorageNode', { streamId, nodeAddress })
        }
    }

    removeStorageAssignment(streamId: StreamID, nodeAddress: EthereumAddress): void {
        this.storageAssignments.remove(streamId, nodeAddress)
    }

    getStorageNodeMetadata(nodeAddress: EthereumAddress): StorageNodeMetadata | undefined {
        return this.storageNodeMetadatas.get(nodeAddress)
    }

    setStorageNodeMetadata(nodeAddress: EthereumAddress, metadata: StorageNodeMetadata): void {
        this.storageNodeMetadatas.set(nodeAddress, metadata)
    }

    hasErc1271AllowedAddress(contractAddress: EthereumAddress, signerUserId: UserID): boolean {
        return this.erc1271AllowedAddresses.has(contractAddress, signerUserId)
    }

    addErc1271AllowedAddress(contractAddress: EthereumAddress, signerUserId: UserID): void {
        this.erc1271AllowedAddresses.add(contractAddress, signerUserId)
    }

    on<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.on(eventName, listener)
    }
}
