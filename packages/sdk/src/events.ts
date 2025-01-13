import { ObservableEventEmitter } from '@streamr/utils'
import { ContractTransactionReceipt } from 'ethers'
import { Lifecycle, scoped } from 'tsyringe'
import { StreamCreationEvent } from './contracts/StreamRegistry'
import { StorageNodeAssignmentEvent } from './contracts/StreamStorageRegistry'
import { StreamMessage } from './protocol/StreamMessage'

export interface StreamrClientEvents {
    streamCreated: (payload: StreamCreationEvent) => void
    streamAddedToStorageNode: (payload: StorageNodeAssignmentEvent) => void
    streamRemovedFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
    /** @internal */
    encryptionKeyStoredToLocalStore: (keyId: string) => void
    /** @internal */
    contractTransactionConfirmed: (payload: { methodName: string; receipt: ContractTransactionReceipt | null }) => void
}

// events for internal communication between StreamrClient components
export interface InternalEvents {
    messagePublished: (message: StreamMessage) => void
    streamPartSubscribed: () => void
}

@scoped(Lifecycle.ContainerScoped)
export class StreamrClientEventEmitter extends ObservableEventEmitter<StreamrClientEvents & InternalEvents> {}
