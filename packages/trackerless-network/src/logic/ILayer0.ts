import { DataEntry, ITransport, PeerDescriptor, PeerID, RecursiveFindResult } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface ILayer0 extends ITransport {
    getPeerDescriptor(): PeerDescriptor
    getNodeId(): PeerID
    getDataFromDht(key: Uint8Array): Promise<RecursiveFindResult>
    findDataViaPeer(key: Uint8Array, peer: PeerDescriptor): Promise<DataEntry[]>
    storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]>
    getKnownEntryPoints(): PeerDescriptor[]
    isJoinOngoing(): boolean
    stop(): Promise<void>
}
