import {
    DataEntry,
    DhtAddress,
    PeerDescriptor,
    areEqualPeerDescriptors
} from '@streamr/dht'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { Any } from '../proto/google/protobuf/any'

const parsePeerDescriptor = (dataEntries: DataEntry[]): PeerDescriptor[] => {
    return dataEntries.filter((entry) => !entry.deleted).map((entry) => Any.unpack(entry.data!, PeerDescriptor))
}

const logger = new Logger(module)

export const MAX_NODE_COUNT = 8

interface NodeRegistryConfig {
    key: DhtAddress
    localPeerDescriptor: PeerDescriptor
    storeInterval?: number
    fetchDataFromDht: (key: DhtAddress) => Promise<DataEntry[]>
    storeDataToDht: (key: DhtAddress, data: Any) => Promise<PeerDescriptor[]>
    deleteDataFromDht: (key: DhtAddress, waitForCompletion: boolean) => Promise<void>
}

/**
 * For each key there is usually 0-MAX_NODE_COUNT PeerDescriptors stored in the DHT. If there are fewer node,
 * the peer descriptor of the local node is stored to the DHT.
 */
export class NodeStoreManager {

    private readonly abortController: AbortController
    private readonly config: NodeRegistryConfig
    // eslint-disable-next-line no-underscore-dangle
    private isLocalNodeStored_ = false

    constructor(config: NodeRegistryConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    async fetchNodes(): Promise<PeerDescriptor[]> {
        logger.trace('Fetch data', { key: this.config.key })
        try {
            const result = await this.config.fetchDataFromDht(this.config.key)
            return parsePeerDescriptor(result)
        } catch (err) {
            return []
        }
    }

    async storeAndKeepLocalNode(): Promise<void> {
        if (this.abortController.signal.aborted) {
            return
        }
        // eslint-disable-next-line no-underscore-dangle
        this.isLocalNodeStored_ = true
        await this.storeLocalNode()
        await this.keepLocalNode()
    }

    private async storeLocalNode(): Promise<void> {
        const localPeerDescriptor = this.config.localPeerDescriptor
        const dataToStore = Any.pack(localPeerDescriptor, PeerDescriptor)
        try {
            await this.config.storeDataToDht(this.config.key, dataToStore)
        } catch (err) {
            logger.warn('Failed to store local node', { key: this.config.key })
        }
    }

    private async keepLocalNode(): Promise<void> {
        await scheduleAtInterval(async () => {
            logger.trace('Attempting to keep local node', { key: this.config.key })
            try {
                const discovered = await this.fetchNodes()
                if (discovered.length < MAX_NODE_COUNT
                    || discovered.some((peerDescriptor) => areEqualPeerDescriptors(peerDescriptor, this.config.localPeerDescriptor))) {
                    await this.storeLocalNode()
                }
            } catch (err) {
                logger.debug('Failed to keep local node', { key: this.config.key })
            }
        }, this.config.storeInterval ?? 60000, false, this.abortController.signal)
    }

    public isLocalNodeStored(): boolean {
        // eslint-disable-next-line no-underscore-dangle
        return this.isLocalNodeStored_
    }

    async destroy(): Promise<void> {
        this.abortController.abort()
        await this.config.deleteDataFromDht(this.config.key, false)
    }
}
