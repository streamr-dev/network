import { ProtoRpcOptions } from '@streamr/proto-rpc'
import { PeerDescriptor } from '../../generated/packages/dht/protos/PeerDescriptor'

export interface DhtRpcOptions extends ProtoRpcOptions {
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    clientId?: number
    connect?: boolean
    sendIfStopped?: boolean
}
