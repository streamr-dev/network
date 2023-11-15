import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'
import { PeerIDKey } from '../../helpers/PeerID'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Empty } from '../../proto/google/protobuf/empty'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebrtcConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { IWebrtcConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { ManagedConnection } from '../ManagedConnection'
import { ManagedWebrtcConnection } from '../ManagedWebrtcConnection'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { WebrtcConnectorRpcRemote } from './WebrtcConnectorRpcRemote'

const logger = new Logger(module)

interface WebrtcConnectorRpcLocalConfig {
    connect: (targetPeerDescriptor: PeerDescriptor) => ManagedConnection 
    onIncomingConnection: (connection: ManagedConnection) => boolean
    // TODO pass accessor methods instead of passing a mutable entity
    ongoingConnectAttempts: Map<PeerIDKey, ManagedWebrtcConnection>
    rpcCommunicator: ListeningRpcCommunicator
    getLocalPeerDescriptor: () => PeerDescriptor
    allowPrivateAddresses: boolean
}

export class WebrtcConnectorRpcLocal implements IWebrtcConnectorRpc {

    private readonly config: WebrtcConnectorRpcLocalConfig

    constructor(config: WebrtcConnectorRpcLocalConfig) {
        this.config = config
    }

    async requestConnection(context: ServerCallContext): Promise<Empty> {
        const targetPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (this.config.ongoingConnectAttempts.has(keyFromPeerDescriptor(targetPeerDescriptor))) {
            return {}
        }
        const managedConnection = this.config.connect(targetPeerDescriptor)
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.config.onIncomingConnection(managedConnection)
        return {}
    }

    async rtcOffer(request: RtcOffer, context: ServerCallContext): Promise<Empty> {
        const remotePeer = (context as DhtCallContext).incomingSourceDescriptor!
        const peerKey = keyFromPeerDescriptor(remotePeer)
        let managedConnection = this.config.ongoingConnectAttempts.get(peerKey)
        let connection = managedConnection?.getWebrtcConnection()

        if (!managedConnection) {
            connection = new NodeWebrtcConnection({ remotePeerDescriptor: remotePeer })
            managedConnection = new ManagedWebrtcConnection(this.config.getLocalPeerDescriptor(), undefined, connection)
            managedConnection.setPeerDescriptor(remotePeer)
            this.config.ongoingConnectAttempts.set(peerKey, managedConnection)
            this.config.onIncomingConnection(managedConnection)
            const remoteConnector = new WebrtcConnectorRpcRemote(
                this.config.getLocalPeerDescriptor(),
                remotePeer,
                toProtoRpcClient(new WebrtcConnectorRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
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
        connection!.setConnectionId(request.connectionId)
        connection!.setRemoteDescription(request.description, 'offer')

        managedConnection.on('handshakeRequest', () => {
            if (this.config.ongoingConnectAttempts.has(peerKey)) {
                this.config.ongoingConnectAttempts.delete(peerKey)
            }
            managedConnection!.acceptHandshake()
        })
        return {}
    }

    async rtcAnswer(request: RtcAnswer, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const peerKey = keyFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.config.ongoingConnectAttempts.get(peerKey)?.getWebrtcConnection()
        if (!connection) {
            return {}
        } else if (connection.connectionId.toString() !== request.connectionId) {
            logger.trace(`Ignoring RTC answer due to connectionId mismatch`)
            return {}
        }
        connection.setRemoteDescription(request.description, 'answer')
        return {}
    }

    async iceCandidate(request: IceCandidate, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const peerKey = keyFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.config.ongoingConnectAttempts.get(peerKey)?.getWebrtcConnection()

        if (!connection) {
            return {}
        } else if (connection.connectionId.toString() !== request.connectionId) {
            logger.trace(`Ignoring remote candidate due to connectionId mismatch`)
            return {}
        } else if (this.isIceCandidateAllowed(request.candidate)) {
            connection.addRemoteCandidate(request.candidate, request.mid)
        }
        return {}
    }

    private isIceCandidateAllowed(candidate: string): boolean {
        if (!this.config.allowPrivateAddresses) {
            const address = getAddressFromIceCandidate(candidate)
            if (address && isPrivateIPv4(address)) {
                return false
            }
        }
        return true
    }
}
