import { DataEntry, DhtAddress, ITransport, PeerDescriptor } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface Layer0Node extends ITransport {
    joinDht(entryPointDescriptors: PeerDescriptor[]): Promise<void>
    hasJoined(): boolean
    getLocalPeerDescriptor(): PeerDescriptor
    getDataFromDht(key: DhtAddress): Promise<DataEntry[]>
    storeDataToDht(key: DhtAddress, data: Any): Promise<PeerDescriptor[]>
    deleteDataFromDht(key: DhtAddress, waitForCompletion: boolean): Promise<void>
    waitForNetworkConnectivity(): Promise<void>
    getTransport(): ITransport
    getNeighbors(): PeerDescriptor[]
    getAllConnectionPeerDescriptors(): PeerDescriptor[]
    start(): Promise<void>
    stop(): Promise<void>
}
