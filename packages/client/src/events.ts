import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { ObservableEventEmitter } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { StreamCreationEvent } from './contracts/StreamRegistry'
import { StorageNodeAssignmentEvent } from './contracts/StreamStorageRegistry'
import { StreamMessage } from '@streamr/protocol'

export interface StreamrClientEvents {
    createStream: (payload: StreamCreationEvent) => void
    addToStorageNode: (payload: StorageNodeAssignmentEvent) => void
    removeFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
    /** @internal */
    storeEncryptionKeyToLocalStore: (keyId: string) => void
    /** @internal */
    confirmContractTransaction: (payload: { methodName: string, transaction: ContractTransaction, receipt: ContractReceipt }) => void
}

// events for internal communication between StreamrClient components
export interface InternalEvents {
    publish: (message: StreamMessage) => void
    subscribe: () => void
}

@scoped(Lifecycle.ContainerScoped)
export class StreamrClientEventEmitter extends ObservableEventEmitter<StreamrClientEvents & InternalEvents> {
}
