import { PeerDescriptor, Remote, UUID } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger, hexToBinary } from '@streamr/utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { InterleaveNotice, StreamHandshakeRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IHandshakeRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export class RemoteHandshaker extends Remote<IHandshakeRpcClient> {

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<IHandshakeRpcClient>
    ) {
        super(ownPeerDescriptor, remotePeerDescriptor, client, serviceId)
    }

    async handshake(
        ownPeerDescriptor: PeerDescriptor,
        neighborIds: NodeID[],
        concurrentHandshakeTargetId?: NodeID,
        interleaveSourceId?: NodeID
    ): Promise<HandshakeResponse> {
        const request: StreamHandshakeRequest = {
            randomGraphId: this.getServiceId(),
            requestId: new UUID().toString(),
            neighborIds: neighborIds.map((id) => hexToBinary(id)),
            concurrentHandshakeTargetId: (concurrentHandshakeTargetId !== undefined) ? hexToBinary(concurrentHandshakeTargetId) : undefined,
            interleaveSourceId: (interleaveSourceId !== undefined) ? hexToBinary(interleaveSourceId) : undefined
        }
        const options = this.formDhtRpcOptions(ownPeerDescriptor)
        try {
            const response = await this.getClient().handshake(request, options)
            return {
                accepted: response.accepted,
                interleaveTargetDescriptor: response.interleaveTargetDescriptor
            }
        } catch (err: any) {
            logger.debug(`handshake to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return {
                accepted: false
            }
        }
    }

    interleaveNotice(ownPeerDescriptor: PeerDescriptor, originatorDescriptor: PeerDescriptor): void {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            notification: true
        })
        const notification: InterleaveNotice = {
            randomGraphId: this.getServiceId(),
            interleaveTargetDescriptor: originatorDescriptor
        }
        this.getClient().interleaveNotice(notification, options).catch(() => {
            logger.debug('Failed to send interleaveNotice')
        })
    }
}
