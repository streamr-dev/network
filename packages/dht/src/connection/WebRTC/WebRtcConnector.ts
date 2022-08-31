import 'setimmediate'
import { EventEmitter } from "events"
import { Event as ManagedConnectionSourceEvents, IManagedConnectionSource } from '../IManagedConnectionSource'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer, WebRtcConnectionRequest
} from '../../proto/DhtRpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { ITransport } from '../../transport/ITransport'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { Event as ConnectionEvents } from '../IConnection'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import { RemoteWebrtcConnector } from './RemoteWebrtcConnector'
import { WebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { Event as IWebRtcEvent } from './IWebRtcConnection'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DescriptionType } from 'node-datachannel'
import crypto from "crypto"
import { ManagedWebRtcConnection } from '../ManagedWebRtcConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { IWebRtcConnector } from "../../proto/DhtRpc.server"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { toProtoRpcClient } from '@streamr/proto-rpc'

const logger = new Logger(module)

export interface WebRtcConnectorConfig {
    rpcTransport: ITransport
    protocolVersion: string
}

export class WebRtcConnector extends EventEmitter implements IManagedConnectionSource, IWebRtcConnector {
    private static WEBRTC_CONNECTOR_SERVICE_ID = 'webrtc_connector'
    private ownPeerDescriptor: PeerDescriptor | null = null
    private rpcCommunicator: RoutingRpcCommunicator
    private rpcTransport: ITransport
    private ongoingConnectAttempts: Map<PeerIDKey, ManagedWebRtcConnection> = new Map()

    constructor(private config: WebRtcConnectorConfig) {
        super()
        this.rpcTransport = config.rpcTransport

        this.rpcCommunicator = new RoutingRpcCommunicator(WebRtcConnector.WEBRTC_CONNECTOR_SERVICE_ID, this.rpcTransport, {
            rpcRequestTimeout: 10000
        })

        this.rtcOffer = this.rtcOffer.bind(this)
        this.rtcAnswer = this.rtcAnswer.bind(this)
        this.iceCandidate = this.iceCandidate.bind(this)
        this.requestConnection = this.requestConnection.bind(this)

        this.rpcCommunicator.registerRpcNotification(RtcOffer, 'rtcOffer', this.rtcOffer)
        this.rpcCommunicator.registerRpcNotification(RtcAnswer, 'rtcAnswer', this.rtcAnswer)
        this.rpcCommunicator.registerRpcNotification(IceCandidate, 'iceCandidate', this.iceCandidate)
        this.rpcCommunicator.registerRpcNotification(WebRtcConnectionRequest, 'requestConnection', this.requestConnection)
    }

    connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const peerKey = PeerID.fromValue(targetPeerDescriptor.peerId).toMapKey()
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            logger.trace(`Opening WebRTC connection to ${targetPeerDescriptor.peerId.toString()}`)
            const existingConnection = this.ongoingConnectAttempts.get(peerKey)
            if (existingConnection) {
                return existingConnection
            }

            const connection = new NodeWebRtcConnection({ remotePeerDescriptor: targetPeerDescriptor })
            const managedConnection = new ManagedWebRtcConnection(this.ownPeerDescriptor!, this.config.protocolVersion, connection)

            managedConnection.setPeerDescriptor(targetPeerDescriptor)
            this.ongoingConnectAttempts.set(peerKey, managedConnection)
            this.bindListenersAndStartConnection(targetPeerDescriptor, connection)

            return managedConnection
        }
        throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    private onRtcOffer(
        remotePeer: PeerDescriptor,
        targetPeer: PeerDescriptor,
        description: string,
        connectionId: string
    ): void {
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeer.peerId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeer.peerId).toMapKey()
        let connection = this.ongoingConnectAttempts.get(peerKey)?.getWebRtcConnection()
        if (!connection) {
            connection = new NodeWebRtcConnection({ remotePeerDescriptor: remotePeer })
            const managedConnection = new ManagedWebRtcConnection(this.ownPeerDescriptor!, this.config.protocolVersion, connection)
            managedConnection.setPeerDescriptor(remotePeer)
            this.ongoingConnectAttempts.set(peerKey, managedConnection)
            this.bindListenersAndStartConnection(remotePeer, connection)

            this.emit(ManagedConnectionSourceEvents.CONNECTED, managedConnection)
        }
        // Always use offerers connectionId
        connection.setConnectionId(connectionId)
        connection.setRemoteDescription(description, DescriptionType.Offer)
    }

    private onRtcAnswer(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        description: string,
        connectionId: string
    ): void {
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeerDescriptor.peerId).toMapKey()
        const connection = this.ongoingConnectAttempts.get(peerKey)?.getWebRtcConnection()
        if (!connection) {
            return
        } else if (connection.connectionId.toString() !== connectionId) {
            logger.trace(`Ignoring RTC answer due to connectionId mismatch`)
            return
        }
        connection.setRemoteDescription(description, DescriptionType.Answer)
    }

    private onConnectionRequest(targetPeerDescriptor: PeerDescriptor): void {
        const managedConnection = this.connect(targetPeerDescriptor)
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.emit(ManagedConnectionSourceEvents.CONNECTED, managedConnection)
    }
    private onRemoteCandidate(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        candidate: string,
        mid: string,
        connectionId: string
    ): void {
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeerDescriptor.peerId).toMapKey()
        const connection = this.ongoingConnectAttempts.get(peerKey)?.getWebRtcConnection()

        if (!connection) {
            return
        } else if (connection.connectionId.toString() !== connectionId) {
            logger.trace(`Ignoring remote candidate due to connectionId mismatch`)
            return
        }
        connection.addRemoteCandidate(candidate, mid)
    }

    stop(): void {
        this.rpcCommunicator.stop()
        this.removeAllListeners()
    }

    bindListenersAndStartConnection(targetPeerDescriptor: PeerDescriptor, connection: NodeWebRtcConnection, sendRequest = true): void {
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            return
        }
        const offering = this.isOffering(targetPeerDescriptor)
        const remoteConnector = new RemoteWebrtcConnector(
            targetPeerDescriptor,
            toProtoRpcClient(new WebRtcConnectorClient(this.rpcCommunicator.getRpcClientTransport()))
        )
        if (offering) {
            connection.once(IWebRtcEvent.LOCAL_DESCRIPTION, async (description, _type) => {
                remoteConnector.sendRtcOffer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        } else {
            connection.once(IWebRtcEvent.LOCAL_DESCRIPTION, async (description, _type) => {
                remoteConnector.sendRtcAnswer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        }
        connection.on(IWebRtcEvent.LOCAL_CANDIDATE, async (candidate, mid) => {
            remoteConnector.sendIceCandidate(this.ownPeerDescriptor!, candidate, mid, connection.connectionId.toString())
        })
        connection.on(ConnectionEvents.CONNECTED, () => {
            // Sending Connected event is now handled by ManagedConnection
            // this.emit(ManagedConnectionSourceEvents.CONNECTED, connection)
        })
        connection.start(offering)
        if (offering === false && sendRequest) {
            remoteConnector.requestConnection(this.ownPeerDescriptor!, connection.connectionId.toString())
        }
    }

    public isOffering(targetPeerDescriptor: PeerDescriptor): boolean {
        const myId = PeerID.fromValue(this.ownPeerDescriptor!.peerId).toMapKey()
        const theirId = PeerID.fromValue(targetPeerDescriptor.peerId).toMapKey()
        return WebRtcConnector.offeringHash(myId + theirId) < WebRtcConnector.offeringHash(theirId + myId)
    }

    private static offeringHash(idPair: string): number {
        const buffer = crypto.createHash('md5').update(idPair).digest()
        return buffer.readInt32LE(0)
    }

    // IWebRTCConnector implementation

    async requestConnection(request: WebRtcConnectionRequest, _context: ServerCallContext): Promise<Empty> {
        this.onConnectionRequest(request.requester!)
        return {}
    }

    async rtcOffer(request: RtcOffer, _context: ServerCallContext): Promise<Empty> {
        this.onRtcOffer(request.requester!, request.target!, request.description, request.connectionId)
        return {}
    }

    async rtcAnswer(request: RtcAnswer, _context: ServerCallContext): Promise<Empty> {
        this.onRtcAnswer(request.requester!, request.target!, request.description, request.connectionId)
        return {}
    }

    async iceCandidate(request: IceCandidate, _context: ServerCallContext): Promise<Empty> {
        this.onRemoteCandidate(request.requester!, request.target!, request.candidate, request.mid, request.connectionId)
        return {}
    }
}
