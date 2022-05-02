import EventEmitter = require('events');
import { DeferredPromises, DhtTransportClient, Event as DhtTransportClientEvent } from './DhtTransportClient'
import { PeerDescriptor, RpcMessage } from '../proto/DhtRpc'
import { DhtTransportServer, Event as DhtTransportServerEvent } from './DhtTransportServer'
import { IConnectionManager, Event as ConnectionLayerEvent } from '../connection/IConnectionManager'

export enum Event {
    OUTGOING_MESSAGE = 'streamr:dht:transport:rpc-communicator:outgoing-message',
    INCOMING_MESSAGE = 'streamr:dht:transport:rpc-communicator:incoming-message'
}

export interface RpcCommunicator {
    on(event: Event.OUTGOING_MESSAGE, listener: () => void): this
    on(event: Event.INCOMING_MESSAGE, listener: () => void): this
}

export class RpcCommunicator extends EventEmitter {
    private static objectCounter = 0
    private objectId = 0
    private readonly dhtTransportClient: DhtTransportClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly connectionLayer: IConnectionManager
    private readonly ongoingRequests: Map<string, DeferredPromises>
    public send: (peerDescriptor: PeerDescriptor, bytes: Uint8Array) => void
    constructor(connectionLayer: IConnectionManager, dhtTransportClient: DhtTransportClient, dhtTransportServer: DhtTransportServer) {
        super()
        this.objectId = RpcCommunicator.objectCounter
        RpcCommunicator.objectCounter++

        this.dhtTransportClient = dhtTransportClient
        this.dhtTransportServer = dhtTransportServer
        this.connectionLayer = connectionLayer
        this.ongoingRequests = new Map()
        this.send = ((_peerDescriptor, _bytes) => { throw new Error('send not defined') })
        this.dhtTransportClient.on(DhtTransportClientEvent.RPC_REQUEST, (deferredPromises: DeferredPromises, rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises)
        })
        this.dhtTransportServer.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
        this.connectionLayer.on(ConnectionLayerEvent.DATA, async (peerDescriptor: PeerDescriptor, bytes: Uint8Array) =>
            await this.onIncomingMessage(peerDescriptor, bytes)
        )
    }

    onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: DeferredPromises): void {
        if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises)
        }
        const bytes = RpcMessage.toBinary(rpcMessage)
        this.send(rpcMessage.targetDescriptor!, bytes)
    }

    async onIncomingMessage(senderDescriptor: PeerDescriptor, bytes: Uint8Array): Promise<void> {
        const rpcCall = RpcMessage.fromBinary(bytes)
        if (rpcCall.header.response && this.ongoingRequests.has(rpcCall.requestId)) {
            this.resolveOngoingRequest(rpcCall)
        } else if (rpcCall.header.request && rpcCall.header.method) {
            await this.handleRequest(senderDescriptor, rpcCall)
        }
    }

    async handleRequest(senderDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        const bytes = await this.dhtTransportServer.onRequest(senderDescriptor, rpcMessage)
        const responseWrapper: RpcMessage = {
            body: bytes,
            header: {
                response: "response",
                method: rpcMessage.header.method
            },
            requestId: rpcMessage.requestId,
            targetDescriptor: rpcMessage.sourceDescriptor,
            sourceDescriptor: rpcMessage.targetDescriptor
        }
        this.onOutgoingMessage(responseWrapper)
    }

    registerRequest(requestId: string, deferredPromises: DeferredPromises): void {
        // TODO: add timeouts?
        this.ongoingRequests.set(requestId, deferredPromises)
    }

    setSendFn(fn: (peerDescriptor: PeerDescriptor, bytes: Uint8Array) => void): void {
        this.send = fn.bind(this)
    }

    resolveOngoingRequest(response: RpcMessage): void {
        const deferredPromises = this.ongoingRequests.get(response.requestId)
        const parsedResponse = deferredPromises!.messageParser(response.body)
        deferredPromises!.message.resolve(parsedResponse)
        deferredPromises!.header.resolve({})
        deferredPromises!.status.resolve({code: 'OK', detail: ''})
        deferredPromises!.trailer.resolve({})
        this.ongoingRequests.delete(response.requestId)
    }

    stop(): void {
        this.removeAllListeners()
        this.send = () => {}
    }
}