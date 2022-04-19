import { ClosestPeersRequest, ClosestPeersResponse } from '../proto/DhtRpc'
import { IDhtRpc } from '../proto/DhtRpc.server'
import { getMockNeighbors } from '../../test/utils'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DummyServerCallContext } from '../transport/DhtTransportServer'

const MockDhtRpc: IDhtRpc = {
    async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        console.info('RPC server processing getClosestPeers request for', request.peerId)
        const neighbors = getMockNeighbors()
        const response: ClosestPeersResponse = {
            neighbors: neighbors,
            nonce: 'why am i still here'
        }
        return response
    }
}

export const MockRegisterDhtRpc = {
    async getClosestPeers(bytes: Uint8Array): Promise<Uint8Array> {
        const request = ClosestPeersRequest.fromBinary(bytes)
        const response = await MockDhtRpc.getClosestPeers(request, new DummyServerCallContext())
        return ClosestPeersResponse.toBinary(response)
    }
}
