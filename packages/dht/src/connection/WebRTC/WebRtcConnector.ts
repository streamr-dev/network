import 'setimmediate'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer, WebRtcConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import { RemoteWebrtcConnector } from './RemoteWebrtcConnector'
import { WebRtcConnectorServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DescriptionType } from 'node-datachannel'
import { ManagedWebRtcConnection } from '../ManagedWebRtcConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { IWebRtcConnectorService } from "../../proto/packages/dht/protos/DhtRpc.server"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'

const logger = new Logger(module)

export interface WebRtcConnectorConfig {
    rpcTransport: ITransport
    protocolVersion: string
    iceServers?: IceServer[]
    disallowPrivateAddresses?: boolean
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    connectionTimeout?: number
}

export interface IceServer {
    url: string
    port: number
    username?: string
    password?: string
    tcp?: boolean
}

export class WebRtcConnector implements IWebRtcConnectorService {
    private static readonly WEBRTC_CONNECTOR_SERVICE_ID = 'system/webrtc_connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly ongoingConnectAttempts: Map<PeerIDKey, ManagedWebRtcConnection> = new Map()
    private readonly rpcTransport: ITransport
    private ownPeerDescriptor?: PeerDescriptor
    private stopped = false
    private static objectCounter = 0
    private objectId = 0
    private iceServers: IceServer[]
    private disallowPrivateAddresses: boolean
    private config: WebRtcConnectorConfig
    private incomingConnectionCallback: (connection: ManagedConnection) => boolean

    constructor(
        config: WebRtcConnectorConfig,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean
    ) {

        this.config = config

        WebRtcConnector.objectCounter++
        this.objectId = WebRtcConnector.objectCounter

        this.rpcTransport = config.rpcTransport
        this.iceServers = config.iceServers || []
        this.disallowPrivateAddresses = config.disallowPrivateAddresses || false
        this.incomingConnectionCallback = incomingConnectionCallback

        this.rpcCommunicator = new ListeningRpcCommunicator(WebRtcConnector.WEBRTC_CONNECTOR_SERVICE_ID, this.rpcTransport, {
            rpcRequestTimeout: 15000
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
        if (PeerID.fromValue(this.ownPeerDescriptor!.kademliaId).equals(PeerID.fromValue(targetPeerDescriptor.kademliaId))) {
            throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
        }

        logger.trace(`Opening WebRTC connection to ${targetPeerDescriptor.kademliaId.toString()}`)

        const peerKey = PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey()
        const existingConnection = this.ongoingConnectAttempts.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new NodeWebRtcConnection({
            remotePeerDescriptor: targetPeerDescriptor,
            iceServers: this.iceServers,
            bufferThresholdLow: this.config.bufferThresholdLow,
            bufferThresholdHigh: this.config.bufferThresholdHigh,
            connectingTimeout: this.config.connectionTimeout
        })

        const offering = this.isOffering(targetPeerDescriptor)
        let managedConnection: ManagedWebRtcConnection

        if (offering) {
            managedConnection = new ManagedWebRtcConnection(this.ownPeerDescriptor!, this.config.protocolVersion, connection)
        } else {
            managedConnection = new ManagedWebRtcConnection(this.ownPeerDescriptor!, this.config.protocolVersion, undefined, connection)
        }

        managedConnection.setPeerDescriptor(targetPeerDescriptor)

        this.ongoingConnectAttempts.set(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey(), managedConnection)

        const delFunc = () => {
            if (this.ongoingConnectAttempts.has(peerKey)) {
                this.ongoingConnectAttempts.delete(peerKey)
            }
            connection.off('disconnected', delFunc)
            managedConnection.off('handshakeCompleted', delFunc)
        }
        connection.on('disconnected', delFunc)
        managedConnection.on('handshakeCompleted', delFunc)

        const remoteConnector = new RemoteWebrtcConnector(
            targetPeerDescriptor,
            toProtoRpcClient(new WebRtcConnectorServiceClient(this.rpcCommunicator.getRpcClientTransport()))
        )

        connection.on('localCandidate', (candidate: string, mid: string) => {
            remoteConnector.sendIceCandidate(this.ownPeerDescriptor!, candidate, mid, connection.connectionId.toString())
        })

        if (offering) {
            connection.once('localDescription', (description: string, _type: string) => {
                remoteConnector.sendRtcOffer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        } else {
            connection.once('localDescription', (description: string, _type: string) => {
                remoteConnector.sendRtcAnswer(this.ownPeerDescriptor!, description, connection.connectionId.toString())
            })
        }

        connection.start(offering)

        if (!offering) {
            remoteConnector.requestConnection(this.ownPeerDescriptor!, connection.connectionId.toString())
        }

        return managedConnection
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    isIceCandidateAllowed(candidate: string): boolean {
        if (this.disallowPrivateAddresses) {
            const address = getAddressFromIceCandidate(candidate)
            if (address && isPrivateIPv4(address)) {
                return false
            }
        }
        return true
    }

    private onRtcOffer(
        remotePeer: PeerDescriptor,
        targetPeer: PeerDescriptor,
        description: string,
        connectionId: string
    ): void {
        if (this.stopped || !PeerID.fromValue(this.ownPeerDescriptor!.kademliaId).equals(PeerID.fromValue(targetPeer.kademliaId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeer.kademliaId).toKey()
        let managedConnection = this.ongoingConnectAttempts.get(peerKey)
        let connection = managedConnection?.getWebRtcConnection()

        if (!managedConnection) {
            connection = new NodeWebRtcConnection({ remotePeerDescriptor: remotePeer })
            managedConnection = new ManagedWebRtcConnection(this.ownPeerDescriptor!, this.config.protocolVersion, undefined, connection)
            
            managedConnection.setPeerDescriptor(remotePeer)

            this.ongoingConnectAttempts.set(peerKey, managedConnection)
            this.incomingConnectionCallback(managedConnection)

            const remoteConnector = new RemoteWebrtcConnector(
                remotePeer,
                toProtoRpcClient(new WebRtcConnectorServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )

            connection.on('localCandidate', (candidate: string, mid: string) => {
                remoteConnector.sendIceCandidate(this.ownPeerDescriptor!, candidate, mid, connection!.connectionId.toString())
            })

            connection.once('localDescription', (description: string, _type: string) => {
                remoteConnector.sendRtcAnswer(this.ownPeerDescriptor!, description, connection!.connectionId.toString())
            })

            connection.start(false)

        }

        // Always use offerers connectionId
        connection!.setConnectionId(connectionId)
        connection!.setRemoteDescription(description, DescriptionType.Offer)
        
        managedConnection!.on('handshakeRequest', () => {
            if (this.ongoingConnectAttempts.has(peerKey)) {
                this.ongoingConnectAttempts.delete(peerKey)
            }
            managedConnection!.acceptHandshake()
        })
    }

    private onRtcAnswer(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        description: string,
        connectionId: string
    ): void {
        if (this.stopped || !PeerID.fromValue(this.ownPeerDescriptor!.kademliaId).equals(PeerID.fromValue(targetPeerDescriptor.kademliaId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeerDescriptor.kademliaId).toKey()
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
        if (this.stopped || this.ongoingConnectAttempts.has(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey())) {
            return
        }
        const managedConnection = this.connect(targetPeerDescriptor)
        managedConnection.setPeerDescriptor(targetPeerDescriptor)

        this.incomingConnectionCallback(managedConnection)
        //this.emit('newConnection', managedConnection)
    }
    private onRemoteCandidate(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        candidate: string,
        mid: string,
        connectionId: string
    ): void {
        if (this.stopped || !PeerID.fromValue(this.ownPeerDescriptor!.kademliaId).equals(PeerID.fromValue(targetPeerDescriptor.kademliaId))) {
            return
        }
        const peerKey = PeerID.fromValue(remotePeerDescriptor.kademliaId).toKey()
        const connection = this.ongoingConnectAttempts.get(peerKey)?.getWebRtcConnection()

        if (!connection) {
            return
        } else if (connection.connectionId.toString() !== connectionId) {
            logger.trace(`Ignoring remote candidate due to connectionId mismatch`)
            return
        } else if (this.isIceCandidateAllowed(candidate)) {
            connection.addRemoteCandidate(candidate, mid)
        }
    }

    public async stop(): Promise<void> {
        logger.trace('stop()')
        this.stopped = true

        const attempts = Array.from(this.ongoingConnectAttempts.values())
        await Promise.allSettled(attempts.map((conn) => conn.close()))
       
        this.rpcCommunicator.stop()
    }

    public isOffering(targetPeerDescriptor: PeerDescriptor): boolean {

        const myId = PeerID.fromValue(this.ownPeerDescriptor!.kademliaId)
        const theirId = PeerID.fromValue(targetPeerDescriptor.kademliaId)
        return myId.hasSmallerHashThan(theirId)

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
