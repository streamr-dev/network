import { PeerDescriptor, Remote } from '@streamr/dht'
import { Logger, hexToBinary } from '@streamr/utils'
import { v4 } from 'uuid'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { InterleaveNotice, StreamPartHandshakeRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IHandshakeRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export class HandshakeRpcRemote extends Remote<IHandshakeRpcClient> {

    async handshake(
        neighborIds: NodeID[],
        concurrentHandshakeTargetId?: NodeID,
        interleaveSourceId?: NodeID
    ): Promise<HandshakeResponse> {
        const request: StreamPartHandshakeRequest = {
            streamPartId: this.getServiceId(),
            requestId: v4(),
            neighborIds: neighborIds.map((id) => hexToBinary(id)),
            concurrentHandshakeTargetId: (concurrentHandshakeTargetId !== undefined) ? hexToBinary(concurrentHandshakeTargetId) : undefined,
            interleaveSourceId: (interleaveSourceId !== undefined) ? hexToBinary(interleaveSourceId) : undefined
        }
        try {
            const response = await this.getClient().handshake(request, this.formDhtRpcOptions())
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

    interleaveNotice(originatorDescriptor: PeerDescriptor): void {
        const notification: InterleaveNotice = {
            streamPartId: this.getServiceId(),
            interleaveTargetDescriptor: originatorDescriptor
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().interleaveNotice(notification, options).catch(() => {
            logger.debug('Failed to send interleaveNotice')
        })
    }
}
