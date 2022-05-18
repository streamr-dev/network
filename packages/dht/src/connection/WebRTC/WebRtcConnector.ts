import { EventEmitter } from "events"
import { IConnectionSource } from '../IConnectionSource'
import { PeerDescriptor } from '../../proto/DhtRpc'
import { Event as RpcTransportEvent, ITransport } from '../../transport/ITransport'
import { RpcCommunicator } from '../../transport/RpcCommunicator'
import { ConnectionType, IConnection } from '../IConnection'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import { createRemoteWebRtcConnectorServer, RemoteWebrtcConnector } from './RemoteWebrtcConnector'
import { WebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { Event as IWebRtcEvent, isOffering } from './IWebRtcConnection'
import { PeerID } from '../../PeerID'
import { DescriptionType } from 'node-datachannel'

export interface WebRtcConnectorParams {
    rpcTransport: ITransport,
    rpcCommunicator?: RpcCommunicator
    fnCanConnect: (peerDescriptor: PeerDescriptor) => boolean,
    fnGetConnection: (peerDescriptor: PeerDescriptor) => IConnection | null,
    fnAddConnection: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
}

export class WebRtcConnector extends EventEmitter implements IConnectionSource {
    private ownPeerDescriptor: PeerDescriptor | null = null
    private rpcCommunicator: RpcCommunicator
    private transportListener: any = null
    private rpcTransport: ITransport
    private getManagerConnection: (peerDescriptor: PeerDescriptor) => IConnection | null
    private addManagerConnection: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
    constructor(params: WebRtcConnectorParams) {
        super()
        this.rpcTransport = params.rpcTransport
        if (params.rpcCommunicator) {
            this.rpcCommunicator = params.rpcCommunicator
        } else {
            this.rpcCommunicator = new RpcCommunicator({
                rpcRequestTimeout: 10000,
                appId: "webrtc",
                connectionLayer: params.rpcTransport
            })
        }
        this.transportListener = params.rpcTransport.on(RpcTransportEvent.DATA, (peerDescriptor, message, appId) => {
            if (appId === 'webrtc' && this.rpcCommunicator) {
                this.rpcCommunicator!.onIncomingMessage(peerDescriptor, message)
            }
        })
        this.getManagerConnection = params.fnGetConnection
        this.addManagerConnection = params.fnAddConnection
        const methods = createRemoteWebRtcConnectorServer(
            this.onRtcOffer.bind(this),
            this.onRtcAnswer.bind(this),
            this.onRemoteCandidate.bind(this),
            this.onConnectionRequest.bind(this),
        )
        this.rpcCommunicator.registerServerMethod('rtcOffer', methods.rtcOffer)
        this.rpcCommunicator.registerServerMethod('rtcAnswer', methods.rtcAnswer)
        this.rpcCommunicator.registerServerMethod('iceCandidate', methods.iceCandidate)
        this.rpcCommunicator.registerServerMethod('requestConnection', methods.requestConnection)
    }

    connect(targetPeerDescriptor: PeerDescriptor): IConnection {
        const existingConnection = this.getWebRtcConnection(targetPeerDescriptor)
        if (existingConnection) {
            return existingConnection as unknown as IConnection
        }
        const newConnection = this.createConnection(targetPeerDescriptor)
        return newConnection
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    getWebRtcConnection(peerDescriptor: PeerDescriptor): NodeWebRtcConnection | null  {
        const connection = this.getManagerConnection(peerDescriptor)
        if (connection && connection.connectionType === ConnectionType.WEBRTC) {
            return connection as unknown as NodeWebRtcConnection
        }
        return null
    }

    private createConnection(targetPeerDescriptor: PeerDescriptor, sendRequest = true): NodeWebRtcConnection {
        const connection = new NodeWebRtcConnection(targetPeerDescriptor)
        this.bindListenersAndStartConnection(targetPeerDescriptor, connection, sendRequest)
        return connection
    }

    private onRtcOffer(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        description: string,
        _connectionId: string
    ): void {
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).toString() !== PeerID.fromValue(targetPeerDescriptor.peerId).toString()) {
            return
        }
        let connection = this.getWebRtcConnection(remotePeerDescriptor)
        if (!connection) {
            connection = this.createConnection(remotePeerDescriptor, false)
            this.addManagerConnection(remotePeerDescriptor, connection)
        }
        connection.setRemoteDescription(description, DescriptionType.Offer)
    }

    private onRtcAnswer(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        description: string,
        _connectionId: string
    ): void {
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).toString() !== PeerID.fromValue(targetPeerDescriptor.peerId).toString()) {
            return
        }
        const connection = this.getWebRtcConnection(remotePeerDescriptor)
        if (!connection) {
            return
        }
        connection.setRemoteDescription(description, DescriptionType.Answer)
    }

    private onConnectionRequest(targetPeerDescriptor: PeerDescriptor): void {
        const connection = this.connect(targetPeerDescriptor)
        this.addManagerConnection(targetPeerDescriptor, connection)
    }
    private onRemoteCandidate(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        candidate: string,
        mid: string,
        _connectionId: string
    ): void {
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).toString() !== PeerID.fromValue(targetPeerDescriptor.peerId).toString()) {
            return
        }
        const connection = this.getWebRtcConnection(remotePeerDescriptor)
        if (!connection) {
            return
        }
        connection.addRemoteCandidate(candidate, mid)
    }

    stop(): void {
        this.rpcCommunicator.stop()
    }

    bindListenersAndStartConnection(targetPeerDescriptor: PeerDescriptor, connection: NodeWebRtcConnection, sendRequest = true): void {
        const offering = isOffering(
            PeerID.fromValue(this.ownPeerDescriptor!.peerId).toString(),
            PeerID.fromValue(targetPeerDescriptor.peerId).toString()
        )
        const remoteConnector = new RemoteWebrtcConnector(
            targetPeerDescriptor,
            new WebRtcConnectorClient(this.rpcCommunicator.getRpcClientTransport())
        )
        if (offering) {
            connection.once(IWebRtcEvent.LOCAL_DESCRIPTION, async (description, _type) => {
                await remoteConnector.sendRtcOffer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        } else {
            connection.once(IWebRtcEvent.LOCAL_DESCRIPTION, async (description, _type) => {
                await remoteConnector.sendRtcAnswer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        }
        connection.on(IWebRtcEvent.LOCAL_CANDIDATE, async (candidate, mid) => {
            await remoteConnector.sendIceCandidate(this.ownPeerDescriptor!, candidate, mid, connection.connectionId.toString())
        })
        connection.start(offering)
        if (!offering && sendRequest) {
            remoteConnector.requestConnection(this.ownPeerDescriptor!, connection.connectionId.toString())
                .catch(() => {})
        }
    }
}