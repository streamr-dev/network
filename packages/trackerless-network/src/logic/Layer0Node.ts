import { DataEntry, ITransport, PeerDescriptor } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface Layer0Node extends ITransport {
    joinDht(entryPointDescriptors: PeerDescriptor[]): Promise<void>
    hasJoined(): boolean
    getLocalPeerDescriptor(): PeerDescriptor
    getDataFromDht(key: Uint8Array): Promise<DataEntry[]>
    storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]>
    deleteDataFromDht(key: Uint8Array, expectResponses: boolean): Promise<void>
    waitForNetworkConnectivity(): Promise<void>
    getTransport(): ITransport
    start(): Promise<void>
    stop(): Promise<void>
}
