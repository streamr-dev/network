import { SendQueueHint } from '../connection/ConnectionStatistics'
import { ProtoCallContext } from '@streamr/proto-rpc'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { DhtRpcOptions } from './DhtRpcOptions'

export class DhtCallContext extends ProtoCallContext implements DhtRpcOptions {
    // used by client
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    clientId?: number
    connect?: boolean
    sendIfStopped?: boolean
    bufferWhileConnecting?: boolean
    sendQueueHint?: SendQueueHint
    //used in incoming calls
    incomingSourceDescriptor?: PeerDescriptor
}
