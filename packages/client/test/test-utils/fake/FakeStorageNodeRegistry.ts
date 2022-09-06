import { EthereumAddress } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'
import { StorageNodeMetadata, StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { Methods } from '../types'
import { FakeChain } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStorageNodeRegistry implements Methods<StorageNodeRegistry> {

    private chain: FakeChain

    constructor(chain: FakeChain) {
        this.chain = chain
    }

    // eslint-disable-next-line class-methods-use-this
    async setStorageNodeMetadata(_metadata: StorageNodeMetadata | undefined): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async getStorageNodeMetadata(nodeAddress: EthereumAddress): Promise<StorageNodeMetadata | never> {
        const metadata = this.chain.storageNodeMetadatas.get(nodeAddress.toLowerCase())
        if (metadata !== undefined) {
            return metadata
        } else {
            throw new Error(`Node not found: ${nodeAddress}`)
        }
    }
}
