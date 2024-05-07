import { scheduleAtInterval } from '@streamr/utils'
import { EntryPointDiscovery } from './EntryPointDiscovery'
import { Layer1Node } from './Layer1Node'

const DEFAULT_RECONNECT_INTERVAL = 30 * 1000
export class StreamPartReconnect {
    private abortController?: AbortController
    private readonly layer1Node: Layer1Node
    private readonly entryPointDiscovery: EntryPointDiscovery

    constructor(layer1Node: Layer1Node, entryPointDiscovery: EntryPointDiscovery) {
        this.layer1Node = layer1Node
        this.entryPointDiscovery = entryPointDiscovery
    }

    async reconnect(timeout = DEFAULT_RECONNECT_INTERVAL): Promise<void> {
        this.abortController = new AbortController()
        await scheduleAtInterval(async () => {
            const entryPoints = await this.entryPointDiscovery.discoverEntryPointsFromDht()
            await this.layer1Node.joinDht(entryPoints)
            if (this.entryPointDiscovery.isLocalNodeEntryPoint()) {
                await this.entryPointDiscovery.storeAndKeepLocalNodeAsEntryPoint()
            }
            if (this.layer1Node.getNeighborCount() > 0) {
                this.abortController!.abort()
            }
        }, timeout, true, this.abortController.signal)
    }

    isRunning(): boolean {
        return this.abortController ? !this.abortController.signal.aborted : false
    }

    destroy(): void {
        this.abortController?.abort()
    }
}
