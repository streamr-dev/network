import { Remote } from '../Remote'
import { DhtRpcOptions, PeerDescriptor, UUID } from '@streamr/dht'
import { InterleaveNotice, StreamHandshakeRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { IHandshakeRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export class RemoteHandshaker extends Remote<IHandshakeRpcClient> {

    async handshake(
        ownPeerDescriptor: PeerDescriptor,
        neighborIds: NodeID[],
        concurrentHandshakeTargetId?: NodeID,
        interleaveSourceId?: NodeID
    ): Promise<HandshakeResponse> {
        const request: StreamHandshakeRequest = {
            randomGraphId: this.graphId,
            requestId: new UUID().toString(),
            senderId: getNodeIdFromPeerDescriptor(ownPeerDescriptor),
            neighborIds,
            concurrentHandshakeTargetId,
            interleaveSourceId,
            senderDescriptor: ownPeerDescriptor
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor 
        }
        try {
            const response = await this.client.handshake(request, options)
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
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
            notification: true
        }
        const notification: InterleaveNotice = {
            randomGraphId: this.graphId,
            interleaveTargetDescriptor: originatorDescriptor,
            senderId: getNodeIdFromPeerDescriptor(ownPeerDescriptor)
        }
        this.client.interleaveNotice(notification, options).catch(() => {
            logger.debug('Failed to send interleaveNotice')
        })
    }
}
