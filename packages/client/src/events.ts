import { ObservableEventEmitter } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { StreamCreationEvent } from './contracts/StreamRegistry'
import { StorageNodeAssignmentEvent } from './contracts/StreamStorageRegistry'
import { StreamMessage } from '@streamr/protocol'
import { ContractTransactionReceipt } from 'ethers'

export interface StreamrClientEvents {
    createStream: (payload: StreamCreationEvent) => void
    addToStorageNode: (payload: StorageNodeAssignmentEvent) => void
    removeFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
    /** @internal */
    storeEncryptionKeyToLocalStore: (keyId: string) => void
    /** @internal */
    confirmContractTransaction: (payload: { methodName: string, receipt: ContractTransactionReceipt | null }) => void
}

// events for internal communication between StreamrClient components
export interface InternalEvents {
    publish: (message: StreamMessage) => void
    subscribe: () => void
}

@scoped(Lifecycle.ContainerScoped)
export class StreamrClientEventEmitter extends ObservableEventEmitter<StreamrClientEvents & InternalEvents> {
}
