import { DhtAddress, PeerDescriptor, RpcRemote, toNodeId, toDhtAddressRaw } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import { v4 } from 'uuid'
import {
    InterleaveRequest,
    InterleaveResponse,
    StreamPartHandshakeRequest
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { HandshakeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface HandshakeResponse {
    accepted: boolean
    interleaveTargetDescriptor?: PeerDescriptor
}

export const INTERLEAVE_REQUEST_TIMEOUT = 10000

export class HandshakeRpcRemote extends RpcRemote<HandshakeRpcClient> {
    async handshake(
        streamPartId: StreamPartID,
        neighborNodeIds: DhtAddress[],
        concurrentHandshakeNodeId?: DhtAddress,
        interleaveNodeId?: DhtAddress
    ): Promise<HandshakeResponse> {
        const request: StreamPartHandshakeRequest = {
            streamPartId,
            requestId: v4(),
            neighborNodeIds: neighborNodeIds.map((id) => toDhtAddressRaw(id)),
            concurrentHandshakeNodeId:
                concurrentHandshakeNodeId !== undefined ? toDhtAddressRaw(concurrentHandshakeNodeId) : undefined,
            interleaveNodeId: interleaveNodeId !== undefined ? toDhtAddressRaw(interleaveNodeId) : undefined
        }
        try {
            const response = await this.getClient().handshake(request, this.formDhtRpcOptions())
            return {
                accepted: response.accepted,
                interleaveTargetDescriptor: response.interleaveTargetDescriptor
            }
        } catch (err: any) {
            logger.debug(`handshake to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
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
            logger.debug(`interleaveRequest to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
            return {
                accepted: false
            }
        }
    }
}
