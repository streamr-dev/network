import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { Event as RpcIoEvent } from "./IRpcIo"
import { ITransport, Event as TransportEvent } from "./ITransport"
import { v4 } from "uuid"
import { CallContext } from "../rpc-protocol/ServerTransport"
import { RpcCommunicator, RpcCommunicatorConfig } from "./RpcCommunicator"

export class RoutingRpcCommunicator extends RpcCommunicator{
    
    constructor(private ownAppId: string, private transport: ITransport, config?: RpcCommunicatorConfig) {
        super(config)
        transport.on(TransportEvent.DATA, (peerDescriptor: PeerDescriptor, message: Message) => {    
            if (message.appId == this.ownAppId) {
                const context = new CallContext()
                context.incomingSourceDescriptor = peerDescriptor
                this.handleIncomingMessage(message.body, context)
            }
        })

        this.on(RpcIoEvent.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: CallContext) => {
            
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

}