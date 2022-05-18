import { EventEmitter } from "events"
import { IConnectionSource } from '../IConnectionSource'
import { PeerDescriptor } from '../../proto/DhtRpc'
import { Event as RpcTransportEvent, ITransport } from '../../transport/ITransport'
import { RpcCommunicator } from '../../transport/RpcCommunicator'
import { createRemoteWebRtcConnectorServer } from './RemoteWebrtcConnector'

export class WebRtcConnector extends EventEmitter implements IConnectionSource {
    private ownPeerDescriptor: PeerDescriptor | null = null
    private rpcCommunicator: RpcCommunicator
    private transportListener: any = null

    constructor(
        private rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor) => boolean,
        rpcCommunicator?: RpcCommunicator
    ) {
        super()
        if (rpcCommunicator) {
            this.rpcCommunicator = rpcCommunicator
        } else {
            this.rpcCommunicator = new RpcCommunicator({
                rpcRequestTimeout: 10000,
                appId: "websocket",
                connectionLayer: rpcTransport
            })
        }
        this.transportListener = rpcTransport.on(RpcTransportEvent.DATA, (peerDescriptor, message, appId) => {
            if (appId === 'websocket' && this.rpcCommunicator) {
                this.rpcCommunicator!.onIncomingMessage(peerDescriptor, message)
            }
        })
        const methods = createRemoteWebRtcConnectorServer(
            this.connect.bind(this),
            fnCanConnect
        )
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }
}