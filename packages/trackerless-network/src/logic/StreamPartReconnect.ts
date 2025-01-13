import { scheduleAtInterval } from '@streamr/utils'
import { MAX_NODE_COUNT, PeerDescriptorStoreManager } from './PeerDescriptorStoreManager'
import { DiscoveryLayerNode } from './DiscoveryLayerNode'

const DEFAULT_RECONNECT_INTERVAL = 30 * 1000
export class StreamPartReconnect {
    private abortController?: AbortController
    private readonly discoveryLayerNode: DiscoveryLayerNode
    private readonly peerDescriptorStoreManager: PeerDescriptorStoreManager

    constructor(discoveryLayerNode: DiscoveryLayerNode, peerDescriptorStoreManager: PeerDescriptorStoreManager) {
        this.discoveryLayerNode = discoveryLayerNode
        this.peerDescriptorStoreManager = peerDescriptorStoreManager
    }

    async reconnect(timeout = DEFAULT_RECONNECT_INTERVAL): Promise<void> {
        this.abortController = new AbortController()
        await scheduleAtInterval(
            async () => {
                const entryPoints = await this.peerDescriptorStoreManager.fetchNodes()
                await this.discoveryLayerNode.joinDht(entryPoints)
                // Is is necessary to store the node as an entry point here?
                if (!this.peerDescriptorStoreManager.isLocalNodeStored() && entryPoints.length < MAX_NODE_COUNT) {
                    await this.peerDescriptorStoreManager.storeAndKeepLocalNode()
                }
                if (this.discoveryLayerNode.getNeighborCount() > 0) {
                    this.abortController!.abort()
                }
            },
            timeout,
            true,
            this.abortController.signal
        )
    }

    isRunning(): boolean {
        return this.abortController ? !this.abortController.signal.aborted : false
    }

    destroy(): void {
        this.abortController?.abort()
    }
}
