import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { ITransport, Event as TransportEvent } from "./ITransport"
import { v4 } from "uuid"
import { RpcCommunicator, RpcCommunicatorConfig, RpcCommunicatorEvents } from "@streamr/proto-rpc"
import { DhtCallContext } from "../rpc-protocol/DhtCallContext"

export class RoutingRpcCommunicator extends RpcCommunicator{
    
    constructor(private ownAppId: string, private transport: ITransport, config?: RpcCommunicatorConfig) {
        super(config)
        transport.on(TransportEvent.DATA, (peerDescriptor: PeerDescriptor, message: Message) => {    
            if (message.appId == this.ownAppId) {
                const context = new DhtCallContext()
                context.incomingSourceDescriptor = peerDescriptor
                this.handleIncomingMessage(message.body, context)
            }
        })

        this.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: DhtCallContext) => {
            
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
