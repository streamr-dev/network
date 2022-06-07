import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { IRpcIo, Event as RpcIoEvent } from "./IRpcIo"
import { ITransport, Event as TransportEvent } from "./ITransport"
import { v4 } from "uuid"
import { CallContext } from "../rpc-protocol/ServerTransport"

export class RpcAdapter {
    
    constructor(private ownAppId: string, private transport: ITransport, private rpc: IRpcIo) {

        transport.on(TransportEvent.DATA, (peerDescriptor: PeerDescriptor, message: Message) => {    
            if (message.appId == this.ownAppId) {
                const context = new CallContext()
                context.incomingSourceDescriptor = peerDescriptor
                this.rpc.handleIncomingMessage(message.body, context)
            }
        })

        this.rpc.on(RpcIoEvent.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: CallContext) => {
            
            let targetDescriptor: PeerDescriptor
            // rpc call message
            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            }
            // rpc reply message
            else {
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = {messageId: v4(), appId: this.ownAppId, body: msgBody, messageType: MessageType.RPC}
            this.transport.send( targetDescriptor!, message)
        })

    }

    /*
    private apps: {[appId: string]: IRpcIo} = {}

    constructor(private transport: ITransport) {
        transport.on(TransportEvent.DATA, (peerDescriptor: PeerDescriptor, message: Message, appId?: string) => {
            if (appId && this.apps.hasOwnProperty(appId)) {
                const context = new CallContext()
                context.incomingSourceDescriptor = peerDescriptor

                this.apps[appId].handleIncomingMessage(message.body, context)
            }
        })
    }

    public registerApp(appId: string, rpcIo: IRpcIo) {
        rpcIo.on(RpcIoEvent.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: CallContext) => {
            
            let targetDescriptor: PeerDescriptor
            // rpc call message
            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            }
            // rpc reply message
            else {
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = {messageId: v4(), appId: appId, body: msgBody, messageType: MessageType.RPC}
            this.transport.send( targetDescriptor!, message, appId)
        })
        this.apps[appId] = rpcIo
    }
    */
}