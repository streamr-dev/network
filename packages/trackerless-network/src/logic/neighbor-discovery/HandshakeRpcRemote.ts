import { PeerDescriptor, RpcRemote } from '@streamr/dht'
import { Logger, hexToBinary } from '@streamr/utils'
import { v4 } from 'uuid'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { InterleaveRequest, InterleaveResponse, StreamPartHandshakeRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IHandshakeRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export class HandshakeRpcRemote extends RpcRemote<IHandshakeRpcClient> {

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

    async interleaveRequest(originatorDescriptor: PeerDescriptor): Promise<InterleaveResponse> {
        const request: InterleaveRequest = {
            interleaveTargetDescriptor: originatorDescriptor
        }
        const options = this.formDhtRpcOptions({
            doNotConnect: true,
            timeout: 2500
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
