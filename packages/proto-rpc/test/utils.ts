
import { PingRequest, PingResponse } from '../src/proto/ProtoRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

interface IDhtRpcWithError {
    ping: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    throwPingError: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    respondPingWithTimeout: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
}

export const MockDhtRpc: IDhtRpcWithError = {

    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            nonce: request.nonce
        }
        return response
    },

    async throwPingError(_urequest: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        throw new Error()
    },
    respondPingWithTimeout(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        return new Promise((resolve, _reject) => {
            const response: PingResponse = {
                nonce: request.nonce
            }
            setTimeout(() => resolve(response), 2000)
        })
    }
}
