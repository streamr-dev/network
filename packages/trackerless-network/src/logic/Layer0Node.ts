import { DataEntry, DataKey, ITransport, PeerDescriptor } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface Layer0Node extends ITransport {
    joinDht(entryPointDescriptors: PeerDescriptor[]): Promise<void>
    hasJoined(): boolean
    getLocalPeerDescriptor(): PeerDescriptor
    getDataFromDht(key: DataKey): Promise<DataEntry[]>
    storeDataToDht(key: DataKey, data: Any): Promise<PeerDescriptor[]>
    deleteDataFromDht(key: DataKey, waitForCompletion: boolean): Promise<void>
    waitForNetworkConnectivity(): Promise<void>
    getTransport(): ITransport
    start(): Promise<void>
    stop(): Promise<void>
}
