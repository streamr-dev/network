import { scheduleAtInterval } from '@streamr/utils'
import { KnownNodesManager } from './KnownNodesManager'
import { DiscoveryLayerNode } from './DiscoveryLayerNode'

const DEFAULT_RECONNECT_INTERVAL = 30 * 1000
export class StreamPartReconnect {
    private abortController?: AbortController
    private readonly discoveryLayerNode: DiscoveryLayerNode
    private readonly knownNodesManager: KnownNodesManager

    constructor(discoveryLayerNode: DiscoveryLayerNode, knownNodesManager: KnownNodesManager) {
        this.discoveryLayerNode = discoveryLayerNode
        this.knownNodesManager = knownNodesManager
    }

    async reconnect(timeout = DEFAULT_RECONNECT_INTERVAL): Promise<void> {
        this.abortController = new AbortController()
        await scheduleAtInterval(async () => {
            const entryPoints = await this.knownNodesManager.discoverNodes()
            await this.discoveryLayerNode.joinDht(entryPoints)
            if (this.knownNodesManager.isLocalNodeStored()) {
                await this.knownNodesManager.storeAndKeepLocalNodeAsEntryPoint()
            }
            if (this.discoveryLayerNode.getNeighborCount() > 0) {
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
