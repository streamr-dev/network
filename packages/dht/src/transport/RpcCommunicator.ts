import EventEmitter = require('events');
import { DeferredPromises, DhtTransportClient, Event as DhtTransportClientEvent } from './DhtTransportClient'
import { RpcWrapper } from '../proto/DhtRpc'
import { DhtTransportServer, Event as DhtTransportServerEvent } from './DhtTransportServer'
import { IConnectionLayer, Event as ConnectionLayerEvent } from '../connection/IConnectionLayer'
import { PeerID } from '../types'

export enum Event {
    OUTGOING_MESSAGE = 'streamr:dht:transport:rpc-communicator:outgoing-message',
    INCOMING_MESSAGE = 'streamr:dht:transport:rpc-communicator:incoming-message'
}

export interface RpcCommunicator {
    on(event: Event.OUTGOING_MESSAGE, listener: () => void): this
    on(event: Event.INCOMING_MESSAGE, listener: () => void): this
}

export class RpcCommunicator extends EventEmitter {
    private readonly dhtTransportClient: DhtTransportClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly connectionLayer: IConnectionLayer
    private readonly ongoingRequests: Map<string, DeferredPromises>
    public send: (peerId: PeerID, bytes: Uint8Array) => void
    constructor(connectionLayer: IConnectionLayer, dhtTransportClient: DhtTransportClient, dhtTransportServer: DhtTransportServer) {
        super()
        this.dhtTransportClient = dhtTransportClient
        this.dhtTransportServer = dhtTransportServer
        this.connectionLayer = connectionLayer
        this.ongoingRequests = new Map()
        this.send = ((_peerId, _bytes) => { throw new Error('send not defined') })
        this.dhtTransportClient.on(DhtTransportClientEvent.RPC_REQUEST, (deferredPromises: DeferredPromises, rpcWrapper: RpcWrapper) => {
            this.onOutgoingMessage(rpcWrapper, deferredPromises)
        })
        this.dhtTransportServer.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcWrapper: RpcWrapper) => {
            this.onOutgoingMessage(rpcWrapper)
        })
        this.connectionLayer.on(ConnectionLayerEvent.RPC_CALL, async (bytes: Uint8Array) => await this.onIncomingMessage(bytes))
    }

    onOutgoingMessage(rpcWrapper: RpcWrapper, deferredPromises?: DeferredPromises): void {
        if (deferredPromises) {
            this.registerRequest(rpcWrapper.requestId, deferredPromises)
        }
        const bytes = RpcWrapper.toBinary(rpcWrapper)
        this.send(rpcWrapper.header.peerId as unknown as PeerID, bytes)
    }

    async onIncomingMessage(bytes: Uint8Array): Promise<void> {
        const rpcCall = RpcWrapper.fromBinary(bytes)
        if (rpcCall.header.response && this.ongoingRequests.has(rpcCall.requestId)) {
            this.resolveOngoingRequest(rpcCall)
        } else if (rpcCall.header.request && rpcCall.header.method) {
            await this.handleRequest(rpcCall)
        }
    }

    async handleRequest(rpcWrapper: RpcWrapper): Promise<void> {
        const bytes = await this.dhtTransportServer.onRequest(rpcWrapper)
        const responseWrapper: RpcWrapper = {
            body: bytes,
            header: {
                response: "response",
                method: rpcWrapper.header.method
            },
            requestId: rpcWrapper.requestId
        }
        this.onOutgoingMessage(responseWrapper)
    }

    registerRequest(requestId: string, deferredPromises: DeferredPromises): void {
        // TODO: add timeouts?
        this.ongoingRequests.set(requestId, deferredPromises)
    }

    setSendFn(fn: (peerId: PeerID, bytes: Uint8Array) => void): void {
        this.send = fn
    }

    resolveOngoingRequest(response: RpcWrapper): void {
        const deferredPromises = this.ongoingRequests.get(response.requestId)
        const parsedResponse = deferredPromises!.messageParser(response.body)
        deferredPromises!.message.resolve(parsedResponse)
        deferredPromises!.header.resolve({})
        deferredPromises!.status.resolve({code: 'OK', detail: ''})
        deferredPromises!.trailer.resolve({})
        this.ongoingRequests.delete(response.requestId)
    }
}