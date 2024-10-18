import { ProtoCallContext } from '@streamr/proto-rpc'
import { PeerDescriptor } from '../../generated/packages/dht/protos/PeerDescriptor'
import { DhtRpcOptions } from './DhtRpcOptions'

export class DhtCallContext extends ProtoCallContext implements DhtRpcOptions {
    // used by client
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    clientId?: number
    connect?: boolean
    sendIfStopped?: boolean
    //used in incoming calls
    incomingSourceDescriptor?: PeerDescriptor
}
