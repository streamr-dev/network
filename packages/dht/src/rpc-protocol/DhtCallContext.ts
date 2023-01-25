import { ProtoCallContext } from "@streamr/proto-rpc"
import { PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { DhtRpcOptions } from "./DhtRpcOptions"

export class DhtCallContext extends ProtoCallContext implements DhtRpcOptions {
    // used by client
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    notification?: boolean
    clientId?: number
    doNotConnect?: boolean 
    //used in incoming calls
    incomingTargetDescriptor?: PeerDescriptor
    incomingSourceDescriptor?: PeerDescriptor
}
