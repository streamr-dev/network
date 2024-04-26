import { PeerDescriptor } from '@streamr/dht'
import { EntryPointDiscovery, FindEntryPointsResult } from '../../../src/logic/EntryPointDiscovery'

export const createFakeEntryPointDiscovery = (): EntryPointDiscovery => {
    return new FakeEntryPointDiscovery() as unknown as EntryPointDiscovery
}

class FakeEntryPointDiscovery {

    private entryPoints: PeerDescriptor[] = []

    setEntryPoints(nodes: PeerDescriptor[]): void {
        this.entryPoints = nodes
    } 

    async discoverEntryPointsFromDht(): Promise<FindEntryPointsResult> {
        return {
            entryPointsFromDht: true,
            discoveredEntryPoints: this.entryPoints
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async storeSelfAsEntryPointIfNecessary(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    isLocalNodeEntryPoint(): boolean {
        return true
    }
    
}
