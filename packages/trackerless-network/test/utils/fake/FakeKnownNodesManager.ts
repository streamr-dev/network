import { PeerDescriptor } from '@streamr/dht'
import { KnownNodesManager } from '../../../src/logic/KnownNodesManager'

export const createFakeKnownNodesManager = (): KnownNodesManager => {
    return new FakeKnownNodesManager() as unknown as KnownNodesManager
}

class FakeKnownNodesManager {

    private entryPoints: PeerDescriptor[] = []

    setEntryPoints(nodes: PeerDescriptor[]): void {
        this.entryPoints = nodes
    } 

    async discoverEntryPoints(): Promise<PeerDescriptor[]> {
        return this.entryPoints
    }

    // eslint-disable-next-line class-methods-use-this
    async storeAndKeepLocalNodeAsEntryPoint(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    isLocalNodeEntryPoint(): boolean {
        return true
    }
    
}
