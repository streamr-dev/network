import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { ITransport } from "./ITransport"
import { v4 } from "uuid"
import { RpcCommunicator, RpcCommunicatorConfig, RpcCommunicatorEvent } from "@streamr/proto-rpc"
import { DhtCallContext } from "../rpc-protocol/DhtCallContext"

export class RoutingRpcCommunicator extends RpcCommunicator {
    
    constructor(private ownServiceId: string, private transport: ITransport, config?: RpcCommunicatorConfig) {
        super(config)
        transport.on('DATA', (message: Message, peerDescriptor: PeerDescriptor) => {
            if (message.serviceId == this.ownServiceId) {
                const context = new DhtCallContext()
                context.incomingSourceDescriptor = peerDescriptor
                this.handleIncomingMessage(message.body, context)
            }
        })

        this.on(RpcCommunicatorEvent.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: DhtCallContext) => {
            
            let targetDescriptor: PeerDescriptor
            // rpc call message
            
            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            } else { // rpc reply message
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = { messageId: v4(), serviceId: this.ownServiceId, body: msgBody, messageType: MessageType.RPC }
            this.transport.send(message, targetDescriptor!)
        })

    }
}
