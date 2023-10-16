import { DataEntry, ITransport, PeerDescriptor, RecursiveFindResult } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface ILayer0 extends ITransport {
    getPeerDescriptor(): PeerDescriptor
    getDataFromDht(key: Uint8Array): Promise<RecursiveFindResult>
    findDataViaPeer(key: Uint8Array, node: PeerDescriptor): Promise<DataEntry[]>
    storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]>
    deleteDataFromDht(key: Uint8Array): Promise<void>
    getKnownEntryPoints(): PeerDescriptor[]
    waitForConnectivity(): Promise<void>
    isJoinOngoing(): boolean
    stop(): Promise<void>
}
