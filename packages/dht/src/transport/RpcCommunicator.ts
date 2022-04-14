import EventEmitter = require('events');
import { DhtTransportClient, Event as DhtTransportClientEvent } from './DhtTransportClient'
import { RpcWrapper } from '../proto/DhtRpc'
import { UnaryCall } from '@protobuf-ts/runtime-rpc'
import { DhtTransportServer, Event as DhtTransportServerEvent } from './DhtTransportServer'
import { ConnectionManager, Event as ConnectionManagerEvent } from '../connection/ConnectionManager'

export class RpcCommunicator extends EventEmitter {
    private readonly dhtTransportClient: DhtTransportClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly connectionManager: ConnectionManager
    private readonly ongoingRequests: Map<string, UnaryCall<object, object>>
    constructor(connectionManager: ConnectionManager, dhtTransportClient: DhtTransportClient, dhtTransportServer: DhtTransportServer) {
        super()
        this.dhtTransportClient = dhtTransportClient
        this.dhtTransportServer = dhtTransportServer
        this.connectionManager = connectionManager
        this.ongoingRequests = new Map()
        this.dhtTransportClient.on(DhtTransportClientEvent.RPC_REQUEST, (unary: UnaryCall<object, object>, rpcWrapper: RpcWrapper) => {
            this.onOutgoingMessage(rpcWrapper, unary)
        })
        this.dhtTransportServer.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcWrapper: RpcWrapper) => {
            this.onOutgoingMessage(rpcWrapper)
        })
        this.connectionManager.on(ConnectionManagerEvent.RPC_CALL, (bytes: Uint8Array) => this.onIncomingMessage(bytes))
    }

    onOutgoingMessage(rpcWrapper: RpcWrapper, unary?: UnaryCall<object, object>): void {
        if (unary) {
            this.registerRequest(rpcWrapper.requestId, unary)
        }
        // this.send()
    }

    onIncomingMessage(bytes: Uint8Array): void {
        const rpcCall = RpcWrapper.fromBinary(bytes)
        console.info(rpcCall)
    }

    registerRequest(requestId: string, unary: UnaryCall<object, object>): void {
        // TODO: add timeouts?
        this.ongoingRequests.set(requestId, unary)
    }

    parseRpcCallType(rpcWrapper: RpcWrapper): void {
        rpcWrapper.header
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