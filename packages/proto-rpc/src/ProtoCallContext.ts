import * as Err from './errors'
import { RpcOptions, RpcMetadata, ServerCallContext } from '@protobuf-ts/runtime-rpc'

// The interface and the class defined in this file
// provide an unified way for handling of context information
// both on the client and server side of an RPC connection.
// Users can further extend ProtoCallContext to add context information
// they need. See examples/routed-hello for an example of handling context
// information in proto-rpc.

export interface ProtoRpcOptions extends RpcOptions {
    notification?: boolean
    isProtoRpc?: boolean
}

/* eslint-disable class-methods-use-this */
export class ProtoCallContext implements ServerCallContext, ProtoRpcOptions {
    // implementation of the extended interfaces
    method = undefined as unknown as any
    headers = undefined as unknown as any
    deadline = undefined as unknown as any
    trailers = undefined as unknown as any
    status = undefined as unknown as any
    sendResponseHeaders(_data: RpcMetadata): void {
        throw new Err.NotImplemented('Method not implemented.')
    }
    cancelled = undefined as unknown as any
    onCancel(_cb: () => void): () => void {
        throw new Err.NotImplemented('Method not implemented.')
    }

    // own extensions
    [extra: string]: unknown
    notification?: boolean
}
