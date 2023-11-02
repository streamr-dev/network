import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer, WebrtcConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { WebrtcConnectorRpcRemote } from './WebrtcConnectorRpcRemote'
import { WebrtcConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { PeerIDKey } from '../../helpers/PeerID'
import { ManagedWebrtcConnection } from '../ManagedWebrtcConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { IWebrtcConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ManagedConnection } from '../ManagedConnection'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'
import { PortRange } from '../ConnectionManager'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'

const logger = new Logger(module)

export const replaceInternalIpWithExternalIp = (candidate: string, ip: string): string => {
    const parsed = candidate.split(' ')
    const type = parsed[7]
    if (type === 'host') {
        parsed[4] = ip
    }
    return parsed.join(' ')
}

export interface WebrtcConnectorRpcLocalConfig {
    transport: ITransport
    iceServers?: IceServer[]
    allowPrivateAddresses?: boolean
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    maxMessageSize?: number
    connectionTimeout?: number
    externalIp?: string
    portRange?: PortRange
}

export interface IceServer {
    url: string
    port: number
    username?: string
    password?: string
    tcp?: boolean
}

export class WebrtcConnectorRpcLocal implements IWebrtcConnectorRpc {

    private static readonly WEBRTC_CONNECTOR_SERVICE_ID = 'system/webrtc-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly ongoingConnectAttempts: Map<PeerIDKey, ManagedWebrtcConnection> = new Map()
    private ownPeerDescriptor?: PeerDescriptor
    private stopped = false
    private iceServers: IceServer[]
    private allowPrivateAddresses: boolean
    private config: WebrtcConnectorRpcLocalConfig
    private onIncomingConnection: (connection: ManagedConnection) => boolean

    constructor(
        config: WebrtcConnectorRpcLocalConfig,
        onIncomingConnection: (connection: ManagedConnection) => boolean
    ) {
        this.config = config
        this.iceServers = config.iceServers || []
        this.allowPrivateAddresses = config.allowPrivateAddresses || true
        this.onIncomingConnection = onIncomingConnection

        this.rpcCommunicator = new ListeningRpcCommunicator(WebrtcConnectorRpcLocal.WEBRTC_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000
        })
        this.rpcCommunicator.registerRpcNotification(RtcOffer, 'rtcOffer',
            (req: RtcOffer, context: ServerCallContext) => this.rtcOffer(req, context))
        this.rpcCommunicator.registerRpcNotification(RtcAnswer, 'rtcAnswer',
            (req: RtcAnswer, context: ServerCallContext) => this.rtcAnswer(req, context))
        this.rpcCommunicator.registerRpcNotification(IceCandidate, 'iceCandidate',
            (req: IceCandidate, context: ServerCallContext) => this.iceCandidate(req, context))
        this.rpcCommunicator.registerRpcNotification(WebrtcConnectionRequest, 'requestConnection',
            (req: WebrtcConnectionRequest, context: ServerCallContext) => this.requestConnection(req, context))
    }

    connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        if (areEqualPeerDescriptors(targetPeerDescriptor, this.ownPeerDescriptor!)) {
            throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
        }

        logger.trace(`Opening WebRTC connection to ${keyFromPeerDescriptor(targetPeerDescriptor)}`)

        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.ongoingConnectAttempts.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new NodeWebrtcConnection({
            remotePeerDescriptor: targetPeerDescriptor,
            iceServers: this.iceServers,
            bufferThresholdLow: this.config.bufferThresholdLow,
            bufferThresholdHigh: this.config.bufferThresholdHigh,
            connectingTimeout: this.config.connectionTimeout,
            portRange: this.config.portRange
        })

        const offering = this.isOffering(targetPeerDescriptor)
        let managedConnection: ManagedWebrtcConnection

        if (offering) {
            managedConnection = new ManagedWebrtcConnection(this.ownPeerDescriptor!, connection)
        } else {
            managedConnection = new ManagedWebrtcConnection(this.ownPeerDescriptor!, undefined, connection)
        }

        managedConnection.setPeerDescriptor(targetPeerDescriptor)

        this.ongoingConnectAttempts.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)

        const delFunc = () => {
            if (this.ongoingConnectAttempts.has(peerKey)) {
                this.ongoingConnectAttempts.delete(peerKey)
            }
            connection.off('disconnected', delFunc)
            managedConnection.off('handshakeCompleted', delFunc)
        }
        connection.on('disconnected', delFunc)
        managedConnection.on('handshakeCompleted', delFunc)

        const remoteConnector = new WebrtcConnectorRpcRemote(
            this.ownPeerDescriptor!,
            targetPeerDescriptor,
            toProtoRpcClient(new WebrtcConnectorRpcClient(this.rpcCommunicator.getRpcClientTransport()))
        )

        connection.on('localCandidate', (candidate: string, mid: string) => {
            if (this.config.externalIp) {
                candidate = replaceInternalIpWithExternalIp(candidate, this.config.externalIp)
                logger.debug(`onLocalCandidate injected external ip ${candidate} ${mid}`)
            }
            remoteConnector.sendIceCandidate(candidate, mid, connection.connectionId.toString())
        })

        if (offering) {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcOffer(description, connection.connectionId.toString())
            })
        } else {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection.connectionId.toString())
            })
        }

        connection.start(offering)

        if (!offering) {
            remoteConnector.requestConnection(connection.connectionId.toString())
        }

        return managedConnection
    }

    setOwnPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = peerDescriptor
    }

    private isIceCandidateAllowed(candidate: string): boolean {
        if (!this.allowPrivateAddresses) {
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
        if (this.stopped || !areEqualPeerDescriptors(targetPeer, this.ownPeerDescriptor!)) {
            return
        }
        const peerKey = keyFromPeerDescriptor(remotePeer)
        let managedConnection = this.ongoingConnectAttempts.get(peerKey)
        let connection = managedConnection?.getWebrtcConnection()

        if (!managedConnection) {
            connection = new NodeWebrtcConnection({ remotePeerDescriptor: remotePeer })
            managedConnection = new ManagedWebrtcConnection(this.ownPeerDescriptor!, undefined, connection)

            managedConnection.setPeerDescriptor(remotePeer)

            this.ongoingConnectAttempts.set(peerKey, managedConnection)
            this.onIncomingConnection(managedConnection)

            const remoteConnector = new WebrtcConnectorRpcRemote(
                this.ownPeerDescriptor!,
                remotePeer,
                toProtoRpcClient(new WebrtcConnectorRpcClient(this.rpcCommunicator.getRpcClientTransport()))
            )

            connection.on('localCandidate', (candidate: string, mid: string) => {
                remoteConnector.sendIceCandidate(candidate, mid, connection!.connectionId.toString())
            })

            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection!.connectionId.toString())
            })

            connection.start(false)

        }

        // Always use offerers connectionId
        connection!.setConnectionId(connectionId)
        connection!.setRemoteDescription(description, 'offer')

        managedConnection.on('handshakeRequest', () => {
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
        if (this.stopped || !areEqualPeerDescriptors(targetPeerDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const peerKey = keyFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.ongoingConnectAttempts.get(peerKey)?.getWebrtcConnection()
        if (!connection) {
            return
        } else if (connection.connectionId.toString() !== connectionId) {
            logger.trace(`Ignoring RTC answer due to connectionId mismatch`)
            return
        }
        connection.setRemoteDescription(description, 'answer')
    }

    private onConnectionRequest(targetPeerDescriptor: PeerDescriptor): void {
        if (this.stopped || this.ongoingConnectAttempts.has(keyFromPeerDescriptor(targetPeerDescriptor))) {
            return
        }
        const managedConnection = this.connect(targetPeerDescriptor)
        managedConnection.setPeerDescriptor(targetPeerDescriptor)

        this.onIncomingConnection(managedConnection)
    }
    private onRemoteCandidate(
        remotePeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        candidate: string,
        mid: string,
        connectionId: string
    ): void {
        if (this.stopped || !areEqualPeerDescriptors(targetPeerDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const peerKey = keyFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.ongoingConnectAttempts.get(peerKey)?.getWebrtcConnection()

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
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))

        this.rpcCommunicator.stop()
    }

    public isOffering(targetPeerDescriptor: PeerDescriptor): boolean {
        const myId = peerIdFromPeerDescriptor(this.ownPeerDescriptor!)
        const theirId = peerIdFromPeerDescriptor(targetPeerDescriptor)
        return myId.hasSmallerHashThan(theirId)
    }

    // IWebRtcConnector implementation
    // TODO should we read connectionId from WebrtcConnectionRequest (or remove the field)?
    async requestConnection(_request: WebrtcConnectionRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        this.onConnectionRequest(senderPeerDescriptor)
        return {}
    }

    async rtcOffer(request: RtcOffer, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const receiverPeerDescriptor = (context as DhtCallContext).incomingTargetDescriptor!
        this.onRtcOffer(senderPeerDescriptor, receiverPeerDescriptor, request.description, request.connectionId)
        return {}
    }

    async rtcAnswer(request: RtcAnswer, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const receiverPeerDescriptor = (context as DhtCallContext).incomingTargetDescriptor!
        this.onRtcAnswer(senderPeerDescriptor, receiverPeerDescriptor, request.description, request.connectionId)
        return {}
    }

    async iceCandidate(request: IceCandidate, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const receiverPeerDescriptor = (context as DhtCallContext).incomingTargetDescriptor!
        this.onRemoteCandidate(senderPeerDescriptor, receiverPeerDescriptor, request.candidate, request.mid, request.connectionId)
        return {}
    }
}
