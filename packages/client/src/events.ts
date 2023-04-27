import { ObservableEventEmitter } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { StreamCreationEvent } from './registry/StreamRegistry'
import { StorageNodeAssignmentEvent } from './registry/StreamStorageRegistry'

export interface StreamrClientEvents {
    createStream: (payload: StreamCreationEvent) => void
    addToStorageNode: (payload: StorageNodeAssignmentEvent) => void
    removeFromStorageNode: (payload: StorageNodeAssignmentEvent) => void
    /** @internal */
    storeEncryptionKeyToLocalStore: (keyId: string) => void
}

// events for internal communication between StreamrClient components
export interface InternalEvents {
    publish: () => void
    subscribe: () => void
}

@scoped(Lifecycle.ContainerScoped)
export class StreamrClientEventEmitter extends ObservableEventEmitter<StreamrClientEvents & InternalEvents> {
}
