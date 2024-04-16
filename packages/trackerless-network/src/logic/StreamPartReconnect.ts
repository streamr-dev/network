import { scheduleAtInterval } from '@streamr/utils'
import { EntryPointDiscovery } from './EntryPointDiscovery'
import { Layer1Node } from './Layer1Node'

export class StreamPartReconnect {
    private abortController?: AbortController
    private readonly layer1Node: Layer1Node
    private readonly entryPointDiscovery: EntryPointDiscovery

    constructor(layer1Node: Layer1Node, entryPointDiscovery: EntryPointDiscovery) {
        this.layer1Node = layer1Node
        this.entryPointDiscovery = entryPointDiscovery
    }

    async reconnect(): Promise<void> {
        this.abortController = new AbortController()
        await scheduleAtInterval(async () => {
            const entryPoints = await this.entryPointDiscovery.discoverEntryPointsFromDht(0)
            await this.layer1Node.joinDht(entryPoints.discoveredEntryPoints)
            if (this.entryPointDiscovery.isLocalNodeEntryPoint()) {
                await this.entryPointDiscovery.storeSelfAsEntryPointIfNecessary(entryPoints.discoveredEntryPoints.length)
            }
            if (this.layer1Node.getNeighborCount() > 0) {
                this.abortController!.abort()
            }
        }, 30 * 1000, true, this.abortController.signal)
    }

    destroy(): void {
        this.abortController?.abort()
    }
}
