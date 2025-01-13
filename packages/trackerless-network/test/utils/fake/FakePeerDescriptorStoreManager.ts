import { PeerDescriptor } from '@streamr/dht'
import { PeerDescriptorStoreManager } from '../../../src/logic/PeerDescriptorStoreManager'

export const createFakePeerDescriptorStoreManager = (): PeerDescriptorStoreManager => {
    return new FakePeerDescriptorStoreManager() as unknown as PeerDescriptorStoreManager
}

class FakePeerDescriptorStoreManager {
    private nodes: PeerDescriptor[] = []

    setNodes(nodes: PeerDescriptor[]): void {
        this.nodes = nodes
    }

    async fetchNodes(): Promise<PeerDescriptor[]> {
        return this.nodes
    }

    // eslint-disable-next-line class-methods-use-this
    async storeAndKeepLocalNode(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    isLocalNodeStored(): boolean {
        return true
    }
}
