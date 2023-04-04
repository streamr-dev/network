import { ITransport, PeerDescriptor, PeerID, RecursiveFindResult } from '@streamr/dht'
import { Any } from '../proto/google/protobuf/any'

export interface ILayer0 extends ITransport {
    getPeerDescriptor(): PeerDescriptor
    getNodeId(): PeerID
    getDataFromDht(key: Uint8Array): Promise<RecursiveFindResult>
    storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]>
    stop(): Promise<void>
}
