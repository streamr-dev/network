import { PeerDescriptor, RpcRemote } from '@streamr/dht'
import { Logger, hexToBinary } from '@streamr/utils'
import { v4 } from 'uuid'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { InterleaveRequest, InterleaveResponse, StreamPartHandshakeRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { HandshakeRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { StreamPartID } from '@streamr/protocol'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export const INTERLEAVE_REQUEST_TIMEOUT = 15000

export class HandshakeRpcRemote extends RpcRemote<HandshakeRpcClient> {

    async handshake(
        streamPartId: StreamPartID,
        neighborIds: NodeID[],
        concurrentHandshakeTargetId?: NodeID,
        interleaveSourceId?: NodeID
    ): Promise<HandshakeResponse> {
        const request: StreamPartHandshakeRequest = {
            streamPartId,
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

    async interleaveRequest(originatorDescriptor: PeerDescriptor): Promise<InterleaveResponse> {
        const request: InterleaveRequest = {
            interleaveTargetDescriptor: originatorDescriptor
        }
        const options = this.formDhtRpcOptions({
            connect: false,
            timeout: INTERLEAVE_REQUEST_TIMEOUT
        })
        try {
            const res = await this.getClient().interleaveRequest(request, options)
            return {
                accepted: res.accepted
            }
        } catch (err) {
            logger.debug(`interleaveRequest to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return {
                accepted: false
            }
        }
        
    }
}
