import { scheduleAtInterval } from '@streamr/utils'
import { PeerDescriptorStoreManager } from './PeerDescriptorStoreManager'
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
        await scheduleAtInterval(async () => {
            const entryPoints = await this.peerDescriptorStoreManager.fetchNodes()
            await this.discoveryLayerNode.joinDht(entryPoints)
            if (this.peerDescriptorStoreManager.isLocalNodeStored()) {
                await this.peerDescriptorStoreManager.storeAndKeepLocalNode()
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
