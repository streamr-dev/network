import { ProtoRpcOptions } from '@streamr/proto-rpc'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'

export interface DhtRpcOptions extends ProtoRpcOptions {
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    clientId?: number
    connect?: boolean
    sendIfStopped?: boolean
}
