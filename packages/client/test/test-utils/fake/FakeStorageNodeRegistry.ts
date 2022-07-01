import { Lifecycle, scoped } from 'tsyringe'
import { StorageNodeMetadata, StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'

@scoped(Lifecycle.ContainerScoped)
export class FakeStorageNodeRegistry implements Omit<StorageNodeRegistry,
    'nodeRegistryContract' | 'nodeRegistryContractReadonly'> {

    // eslint-disable-next-line class-methods-use-this
    async setStorageNodeMetadata(_metadata: StorageNodeMetadata | undefined): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async getStorageNodeMetadata(_nodeAddress: string): Promise<StorageNodeMetadata> {
        // return some dummy value: the receiving component passes the info to FakeRest,
        // and it is ignored there
        return {
            http: ''
        }
    }
}
