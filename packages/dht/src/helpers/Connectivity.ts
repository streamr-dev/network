import { ConnectionType } from '../connection/IConnection'
import { ConnectivityMethod, NodeType, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { isPrivateIPv4 } from './AddressTools'

export const canOpenConnectionFromBrowser = (websocketServer: ConnectivityMethod): boolean => {
    const hasPrivateAddress = ((websocketServer.host === 'localhost') || isPrivateIPv4(websocketServer.host))
    return websocketServer.tls || hasPrivateAddress
}

export const expectedConnectionType = (localPeerDescriptor: PeerDescriptor, remotePeerDescriptor: PeerDescriptor): ConnectionType => {
    if (remotePeerDescriptor.details?.websocket 
        && (localPeerDescriptor.details?.type !== NodeType.BROWSER || canOpenConnectionFromBrowser(remotePeerDescriptor.details?.websocket))) {
        return ConnectionType.WEBSOCKET_CLIENT
    } else if (localPeerDescriptor.details?.websocket 
        && (remotePeerDescriptor.details?.type !== NodeType.BROWSER || canOpenConnectionFromBrowser(localPeerDescriptor.details?.websocket))) {
        return ConnectionType.WEBSOCKET_SERVER
    }
    return ConnectionType.WEBRTC
}
