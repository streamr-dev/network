import { PeerDescriptor } from '@streamr/dht'
import { NodeStoreManager } from '../../../src/logic/NodeStoreManager'

export const createFakeNodeStoreManager = (): NodeStoreManager => {
    return new FakeNodeStoreManager() as unknown as NodeStoreManager
}

class FakeNodeStoreManager {

    private nodes: PeerDescriptor[] = []

    setNodes(nodes: PeerDescriptor[]): void {
        this.nodes = nodes
    } 

    async fetchNodes(): Promise<PeerDescriptor[]> {
        return this.nodes
    }

    // eslint-disable-next-line class-methods-use-this
    async storeAndKeepLocalNode(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    isLocalNodeStored(): boolean {
        return true
    }
    
}
