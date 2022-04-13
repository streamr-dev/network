import EventEmitter = require('events');
import { DhtTransportClient, Event as DhtTransportClientEvent } from './DhtTransportClient'
import { RpcWrapper } from '../proto/RpcWrapper'
import { UnaryCall } from '@protobuf-ts/runtime-rpc'

// import { DhtTransportServer, Event as DhtTransportServerEvent } from './DhtTransportServer'
export class RpcCommunicator extends EventEmitter {
    private readonly dhtTransportClient: DhtTransportClient
    private readonly ongoingRequests: Map<string, UnaryCall<object, object>>
    constructor(dhtTransportClient: DhtTransportClient) {
        super()
        this.dhtTransportClient = dhtTransportClient
        this.on(DhtTransportClientEvent.RPC_REQUEST, (unary, rpcWrapper) => {
            this.onOutgoingMessage(unary, rpcWrapper)
        })
    }

    onOutgoingMessage(unary: UnaryCall<object, object>, rpcWrapper: RpcWrapper): void {
        this.registerRequest(rpcWrapper.requestId, unary)
        // this.send()
    }

    onIncomingMessage(unary: UnaryCall<object, object>, rpcWrapper: RpcWrapper): void {

    }

    registerRequest(requestId: string, unary: UnaryCall<object, object>): void {
        // TODO: add timeouts?
        this.ongoingRequests.set(requestId, unary)
    }

    // this.transport.request(request)
    //     .then((response: RpcWrapper) => {
    //         return
    //     }, (reason: any) => {
    //         throw new RpcError(reason instanceof Error ? reason.message : reason)
    //     })
    //     .then((message) => {
    //         defMessage.resolve(message)
    //         defStatus.resolve({code: 'OK', detail: ''})
    //         defTrailer.resolve({})
    //     })
}