import { ITransport } from './ITransport'
import { RoutingRpcCommunicator } from './RoutingRpcCommunicator'
import { RpcCommunicatorOptions, RpcError } from '@streamr/proto-rpc'
import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { ServiceID } from '../types/ServiceID'
import { areEqualPeerDescriptors } from '../identifiers'

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    private readonly transport: ITransport
    private readonly messageListener: (msg: Message) => void
    private readonly disconnectedListener: (peerDescriptor: PeerDescriptor) => void

    constructor(ownServiceId: ServiceID, transport: ITransport, options?: RpcCommunicatorOptions) {
        super(ownServiceId, (msg, opts) => transport.send(msg, opts), options)
        this.messageListener = (msg: Message) => {
            this.handleMessageFromPeer(msg)
        }
        this.disconnectedListener = (peerDescriptor: PeerDescriptor) => {
            const requests = this.getRequestIds((request) =>
                areEqualPeerDescriptors(peerDescriptor, request.getCallContext().targetDescriptor!)
            )
            requests.forEach((id) => this.handleClientError(id, new RpcError.Disconnected('Peer disconnected')))
        }
        this.transport = transport
        transport.on('message', this.messageListener)
        transport.on('disconnected', this.disconnectedListener)
    }

    destroy(): void {
        this.transport.off('message', this.messageListener)
        this.transport.off('disconnected', this.disconnectedListener)
        this.stop()
    }
}
