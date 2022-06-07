require('setimmediate')
import { EventEmitter } from "events"
import { Event as ConnectionSourceEvents, IConnectionSource } from '../IConnectionSource'
import {
    HandshakeMessage,
    IceCandidate,
    Message,
    MessageType,
    NotificationResponse,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer, WebRtcConnectionRequest
} from '../../proto/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { ConnectionType, Event as ConnectionEvents, IConnection } from '../IConnection'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import { RemoteWebrtcConnector } from './RemoteWebrtcConnector'
import { WebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { Event as IWebRtcEvent } from './IWebRtcConnection'
import { PeerID } from '../../helpers/PeerID'
import { DescriptionType } from 'node-datachannel'
import crypto from "crypto"
import { TODO } from '../../types'
import { DeferredConnection } from '../DeferredConnection'
import { Logger } from '../../helpers/Logger'
import { Err } from '../../helpers/errors'
import { IWebRtcConnector } from "../../proto/DhtRpc.server"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

const logger = new Logger(module)

export interface WebRtcConnectorConfig {
    rpcTransport: ITransport,
    fnCanConnect: (peerDescriptor: PeerDescriptor) => boolean,
    fnGetConnection: (peerDescriptor: PeerDescriptor) => IConnection | null,
    fnAddConnection: (peerDescriptor: PeerDescriptor, connection: IConnection) => boolean
}

export class WebRtcConnector extends EventEmitter implements IConnectionSource, IWebRtcConnector {
    private WEBRTC_CONNECTOR_APP_ID = 'webrtc_connector'
    private ownPeerDescriptor: PeerDescriptor | null = null
    private rpcCommunicator: RoutingRpcCommunicator
    private rpcTransport: ITransport
    private getManagerConnection: (peerDescriptor: PeerDescriptor) => IConnection | null
    private addManagerConnection: (peerDescriptor: PeerDescriptor, connection: IConnection) => boolean
    constructor(private config: WebRtcConnectorConfig) {
        super()
        this.rpcTransport = config.rpcTransport

        this.rpcCommunicator = new RoutingRpcCommunicator(this.WEBRTC_CONNECTOR_APP_ID, this.rpcTransport, {
            rpcRequestTimeout: 10000
        })

        this.getManagerConnection = config.fnGetConnection
        this.addManagerConnection = config.fnAddConnection

        this.rtcOffer = this.rtcOffer.bind(this)
        this.rtcAnswer = this.rtcAnswer.bind(this)
        this.iceCandidate = this.iceCandidate.bind(this)
        this.requestConnection = this.requestConnection.bind(this)

        this.rpcCommunicator.registerRpcNotification(RtcOffer, 'rtcOffer', this.rtcOffer)
        this.rpcCommunicator.registerRpcNotification(RtcAnswer, 'rtcAnswer', this.rtcAnswer)
        this.rpcCommunicator.registerRpcNotification(IceCandidate, 'iceCandidate', this.iceCandidate)
        this.rpcCommunicator.registerRpcNotification(WebRtcConnectionRequest, 'requestConnection', this.requestConnection)
    }

    connect(targetPeerDescriptor: PeerDescriptor): IConnection {
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            logger.trace(`Opening WebRTC connection to ${targetPeerDescriptor.peerId.toString()}`)
            const existingConnection = this.getWebRtcConnection(targetPeerDescriptor)
            if (existingConnection) {
                return existingConnection as unknown as IConnection
            }
            setImmediate(() => {
                const newConnection = this.createConnection(targetPeerDescriptor)
                const added = this.addManagerConnection(targetPeerDescriptor, newConnection)
                if (!added) {
                    newConnection.close()
                }
            })
            return new DeferredConnection(targetPeerDescriptor)
        }
        throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    getWebRtcConnection(peerDescriptor: PeerDescriptor): NodeWebRtcConnection | null {
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
        connectionId: string
    ): void {
        if (!PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))) {
            return
        }
        let connection = this.getWebRtcConnection(remotePeerDescriptor)
        if (!connection) {
            this.addManagerConnection(remotePeerDescriptor, new DeferredConnection(remotePeerDescriptor))
            connection = this.createConnection(remotePeerDescriptor, false)
            const added = this.addManagerConnection(remotePeerDescriptor, connection)
            if (!added) {
                connection.close()
            }
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
        const connection = this.getWebRtcConnection(remotePeerDescriptor)
        if (!connection) {
            return
        } else if (connection.connectionId.toString() !== connectionId) {
            logger.trace(`Ignoring RTC answer due to connectionId mismatch`)
            return
        }
        connection.setRemoteDescription(description, DescriptionType.Answer)
    }

    private onConnectionRequest(targetPeerDescriptor: PeerDescriptor): void {
        this.addManagerConnection(targetPeerDescriptor, new DeferredConnection(targetPeerDescriptor))
        this.connect(targetPeerDescriptor)
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
        const connection = this.getWebRtcConnection(remotePeerDescriptor)
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
        const offering = this.isOffering(
            PeerID.fromValue(this.ownPeerDescriptor!.peerId).toMapKey(),
            PeerID.fromValue(targetPeerDescriptor.peerId).toMapKey()
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
        connection.on(ConnectionEvents.CONNECTED, () => {
            this.emit(ConnectionSourceEvents.CONNECTED, connection)
        })
        connection.start(offering)
        if (offering === false && sendRequest) {
            remoteConnector.requestConnection(this.ownPeerDescriptor!, connection.connectionId.toString())
                .catch(() => { })
        }
    }

    public isOffering(myId: string, theirId: string): boolean {
        return this.offeringHash(myId + theirId) < this.offeringHash(theirId + myId)
    }

    private offeringHash(idPair: string): number {
        const buffer = crypto.createHash('md5').update(idPair).digest()
        return buffer.readInt32LE(0)
    }

    bindListeners(incomingMessageHandler: TODO, protocolVersion: string): void {
        // set up normal listeners that send a handshake for new connections from webSocketConnector
        this.on(ConnectionSourceEvents.CONNECTED, (connection: IConnection) => {
            connection.on(ConnectionEvents.DATA, async (data: Uint8Array) => {
                const message = Message.fromBinary(data)
                if (this.ownPeerDescriptor) {
                    incomingMessageHandler(connection, message)
                }
            })
            if (this.ownPeerDescriptor) {
                logger.trace(`Initiating handshake with ${connection.getPeerDescriptor()?.peerId.toString()}`)
                const outgoingHandshake: HandshakeMessage = {
                    sourceId: this.ownPeerDescriptor.peerId,
                    protocolVersion: protocolVersion,
                    peerDescriptor: this.ownPeerDescriptor
                }

                const msg: Message = {
                    appId: this.WEBRTC_CONNECTOR_APP_ID,
                    messageType: MessageType.HANDSHAKE, messageId: 'xyz',
                    body: HandshakeMessage.toBinary(outgoingHandshake)
                }

                connection.send(Message.toBinary(msg))
                connection.sendBufferedMessages()
            }
        })
    }

    // IWebRTCConnector implementation

    async requestConnection(request: WebRtcConnectionRequest, _context: ServerCallContext): Promise<NotificationResponse> {
        setImmediate(() => this.onConnectionRequest(request.requester!))
        const res: NotificationResponse = {
            sent: true
        }
        return res
    }

    async rtcOffer(request: RtcOffer, _context: ServerCallContext): Promise<NotificationResponse> {
        setImmediate(() => this.onRtcOffer(request.requester!, request.target!, request.description, request.connectionId))
        const res: NotificationResponse = {
            sent: true
        }
        return res
    }

    async rtcAnswer(request: RtcAnswer, _context: ServerCallContext): Promise<NotificationResponse> {
        setImmediate(() => this.onRtcAnswer(request.requester!, request.target!, request.description, request.connectionId))
        const res: NotificationResponse = {
            sent: true
        }
        return res
    }

    async iceCandidate(request: IceCandidate, _context: ServerCallContext): Promise<NotificationResponse> {
        setImmediate(() => this.onRemoteCandidate(request.requester!, request.target!, request.candidate, request.mid, request.connectionId))
        const res: NotificationResponse = {
            sent: true
        }
        return res
    }
}