import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'
import { Empty } from '../../../generated/google/protobuf/empty'
import { IceCandidate, PeerDescriptor, RtcAnswer, RtcOffer } from '../../../generated/packages/dht/protos/DhtRpc'
import { IWebrtcConnectorRpc } from '../../../generated/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { DhtAddress, toNodeId } from '../../identifiers'
import { ConnectionID } from '../IConnection'
import { ConnectingConnection } from './WebrtcConnector'
import { PendingConnection } from '../PendingConnection'

const logger = new Logger(module)

interface WebrtcConnectorRpcLocalOptions {
    connect: (targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean) => PendingConnection
    onNewConnection: (connection: PendingConnection) => boolean
    // TODO pass accessor methods instead of passing a mutable entity
    ongoingConnectAttempts: Map<DhtAddress, ConnectingConnection>
    rpcCommunicator: ListeningRpcCommunicator
    getLocalPeerDescriptor: () => PeerDescriptor
    allowPrivateAddresses: boolean
}

export class WebrtcConnectorRpcLocal implements IWebrtcConnectorRpc {
    private readonly options: WebrtcConnectorRpcLocalOptions

    constructor(options: WebrtcConnectorRpcLocalOptions) {
        this.options = options
    }

    async requestConnection(context: ServerCallContext): Promise<Empty> {
        const targetPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (this.options.ongoingConnectAttempts.has(toNodeId(targetPeerDescriptor))) {
            return {}
        }
        const pendingConnection = this.options.connect(targetPeerDescriptor, false)
        this.options.onNewConnection(pendingConnection)
        return {}
    }

    async rtcOffer(request: RtcOffer, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = toNodeId(remotePeerDescriptor)
        let connection: NodeWebrtcConnection
        let pendingConnection: PendingConnection

        if (!this.options.ongoingConnectAttempts.has(nodeId)) {
            pendingConnection = this.options.connect(remotePeerDescriptor, true)
            connection = this.options.ongoingConnectAttempts.get(nodeId)!.connection
            this.options.onNewConnection(pendingConnection)
        } else {
            pendingConnection = this.options.ongoingConnectAttempts.get(nodeId)!.managedConnection
            connection = this.options.ongoingConnectAttempts.get(nodeId)!.connection
        }
        // Always use offerers connectionId
        connection!.setConnectionId(request.connectionId as ConnectionID)
        connection!.setRemoteDescription(request.description, 'offer')
        return {}
    }

    async rtcAnswer(request: RtcAnswer, context: ServerCallContext): Promise<Empty> {
        const remotePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = toNodeId(remotePeerDescriptor)
        const connection = this.options.ongoingConnectAttempts.get(nodeId)?.connection
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
        const nodeId = toNodeId(remotePeerDescriptor)
        const connection = this.options.ongoingConnectAttempts.get(nodeId)?.connection
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
        if (!this.options.allowPrivateAddresses) {
            const address = getAddressFromIceCandidate(candidate)
            if (address !== undefined && isPrivateIPv4(address)) {
                return false
            }
        }
        return true
    }
}
