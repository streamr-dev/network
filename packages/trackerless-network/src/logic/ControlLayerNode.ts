import { ConnectionsView, DataEntry, DhtAddress, ITransport, PeerDescriptor } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface ControlLayerNode extends ITransport {
    joinDht(entryPointDescriptors: PeerDescriptor[]): Promise<void>
    hasJoined(): boolean
    getLocalPeerDescriptor(): PeerDescriptor
    fetchDataFromDht(key: DhtAddress): Promise<DataEntry[]>
    storeDataToDht(key: DhtAddress, data: Any): Promise<PeerDescriptor[]>
    deleteDataFromDht(key: DhtAddress, waitForCompletion: boolean): Promise<void>
    waitForNetworkConnectivity(): Promise<void>
    getTransport(): ITransport
    getNeighbors(): PeerDescriptor[]
    getConnectionsView(): ConnectionsView
    start(): Promise<void>
    stop(): Promise<void>
}
