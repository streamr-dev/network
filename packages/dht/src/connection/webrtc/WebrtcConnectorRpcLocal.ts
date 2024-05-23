import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'
import { Empty } from '../../proto/google/protobuf/empty'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebrtcConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { ManagedConnection } from '../ManagedConnection'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { ConnectionID } from '../IConnection'
import { ConnectingConnection } from './WebrtcConnector'

const logger = new Logger(module)

interface WebrtcConnectorRpcLocalConfig {
    createConnection: (targetPeerDescriptor: PeerDescriptor) => NodeWebrtcConnection 
    connect: (targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean) => ManagedConnection 
    onNewConnection: (connection: ManagedConnection) => boolean
    // TODO pass accessor methods instead of passing a mutable entity
    ongoingConnectAttempts: Map<DhtAddress, ConnectingConnection>
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
        if (this.config.ongoingConnectAttempts.has(getNodeIdFromPeerDescriptor(targetPeerDescriptor))) {
            return {}
        }
        const managedConnection = this.config.connect(targetPeerDescriptor, false)
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)
        this.config.onNewConnection(managedConnection)
        return {}
    }

    async rtcOffer(request: RtcOffer, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = getNodeIdFromPeerDescriptor(remotePeerDescriptor)
        let connection: NodeWebrtcConnection
        let managedConnection: ManagedConnection

        if (!this.config.ongoingConnectAttempts.has(nodeId)) {
            managedConnection = this.config.connect(remotePeerDescriptor, true)
            connection = this.config.ongoingConnectAttempts.get(nodeId)!.connection
            this.config.onNewConnection(managedConnection)
        } else {
            managedConnection = this.config.ongoingConnectAttempts.get(nodeId)!.managedConnection
            connection = this.config.ongoingConnectAttempts.get(nodeId)!.connection
        }
        // Always use offerers connectionId
        connection!.setConnectionId(request.connectionId as ConnectionID)
        connection!.setRemoteDescription(request.description, 'offer')
        return {}
    }

    async rtcAnswer(request: RtcAnswer, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = getNodeIdFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.config.ongoingConnectAttempts.get(nodeId)?.connection
        if (!connection) {
            return {}
        } else if (connection.connectionId !== request.connectionId) {
            logger.trace(`Ignoring RTC answer due to connectionId mismatch`)
            return {}
        }
        connection.setRemoteDescription(request.description, 'answer')
        return {}
    }

    async iceCandidate(request: IceCandidate, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = getNodeIdFromPeerDescriptor(remotePeerDescriptor)
        const connection = this.config.ongoingConnectAttempts.get(nodeId)?.connection
        if (!connection) {
            return {}
        } else if (connection.connectionId !== request.connectionId) {
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
            if ((address !== undefined) && isPrivateIPv4(address)) {
                return false
            }
        }
        return true
    }
}
