import { ProtoRpcOptions } from '@streamr/proto-rpc'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface DhtRpcOptions extends ProtoRpcOptions {
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    clientId?: number
}
