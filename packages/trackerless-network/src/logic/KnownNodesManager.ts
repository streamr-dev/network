import {
    DataEntry,
    DhtAddress,
    PeerDescriptor,
    areEqualPeerDescriptors,
    getDhtAddressFromRaw
} from '@streamr/dht'
import { StreamPartID } from '@streamr/protocol'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { createHash } from 'crypto'
import { Any } from '../proto/google/protobuf/any'

export const streamPartIdToDataKey = (streamPartId: StreamPartID): DhtAddress => {
    return getDhtAddressFromRaw(new Uint8Array((createHash('sha1').update(streamPartId).digest())))
}

const parseEntryPointData = (dataEntries: DataEntry[]): PeerDescriptor[] => {
    return dataEntries.filter((entry) => !entry.deleted).map((entry) => Any.unpack(entry.data!, PeerDescriptor))
}

const logger = new Logger(module)

export const ENTRYPOINT_STORE_LIMIT = 8

interface KnownNodesManagerConfig {
    streamPartId: StreamPartID
    localPeerDescriptor: PeerDescriptor
    fetchEntryPointData: (key: DhtAddress) => Promise<DataEntry[]>
    storeEntryPointData: (key: DhtAddress, data: Any) => Promise<PeerDescriptor[]>
    deleteEntryPointData: (key: DhtAddress) => Promise<void>
    storeInterval?: number
}

// TODO maybe better name?
export class KnownNodesManager {

    private readonly abortController: AbortController
    private readonly config: KnownNodesManagerConfig
    private readonly storeInterval: number
    private isLocalPeerDescritorStored = false
    
    constructor(config: KnownNodesManagerConfig) {
        this.config = config
        this.abortController = new AbortController()
        this.storeInterval = this.config.storeInterval ?? 60000
    }

    async discoverNodes(): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(this.config.streamPartId)
        logger.trace(`Discovering entry points for key ${dataKey}`)
        try {
            const result = await this.config.fetchEntryPointData(dataKey)
            return parseEntryPointData(result)
        } catch (err) {
            return []
        }    
    }

    async storeAndKeepLocalNodeAsEntryPoint(): Promise<void> {
        if (this.abortController.signal.aborted) {
            return
        }
        this.isLocalPeerDescritorStored = true
        await this.storeLocalNodeAsEntryPoint()
        await this.keepSelfAsEntryPoint()
    }

    private async storeLocalNodeAsEntryPoint(): Promise<void> {
        const localPeerDescriptor = this.config.localPeerDescriptor
        const dataToStore = Any.pack(localPeerDescriptor, PeerDescriptor)
        try {
            await this.config.storeEntryPointData(streamPartIdToDataKey(this.config.streamPartId), dataToStore)
        } catch (err) {
            logger.warn(`Failed to store self as entrypoint for ${this.config.streamPartId}`)
        }
    }

    private async keepSelfAsEntryPoint(): Promise<void> {
        await scheduleAtInterval(async () => {
            logger.trace(`Attempting to keep self as entrypoint for ${this.config.streamPartId}`)
            try {
                const discovered = await this.discoverNodes()
                if (discovered.length < ENTRYPOINT_STORE_LIMIT 
                    || discovered.some((peerDescriptor) => areEqualPeerDescriptors(peerDescriptor, this.config.localPeerDescriptor))) {
                    await this.storeLocalNodeAsEntryPoint()
                }
            } catch (err) {
                logger.debug(`Failed to keep self as entrypoint for ${this.config.streamPartId}`)
            }
        }, this.storeInterval, false, this.abortController.signal)
    }

    public isLocalNodeStored(): boolean {
        return this.isLocalPeerDescritorStored
    }

    async destroy(): Promise<void> {
        this.abortController.abort()
        await this.config.deleteEntryPointData(streamPartIdToDataKey(this.config.streamPartId))
    }
}
