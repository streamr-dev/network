import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { PortRange } from '../connection/ConnectionManager'
import { IceServer } from '../connection/webrtc/types'

export interface WebrtcConnectionParams {
    remotePeerDescriptor: PeerDescriptor
    bufferThresholdHigh?: number
    bufferThresholdLow?: number
    maxMessageSize?: number
    iceServers?: IceServer[]  // TODO make this parameter required (empty array is a good fallback which can be set by the caller if needed)
    portRange?: PortRange
}
