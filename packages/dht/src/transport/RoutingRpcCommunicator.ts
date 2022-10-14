import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { v4 } from "uuid"
import { RpcCommunicator, RpcCommunicatorConfig } from "@streamr/proto-rpc"
import { DhtCallContext } from "../rpc-protocol/DhtCallContext"

export class RoutingRpcCommunicator extends RpcCommunicator {

    constructor(private ownServiceId: string, private sendFn: (msg: Message) => void, config?: RpcCommunicatorConfig) {
        super(config)

        this.on('outgoingMessage', (msgBody: Uint8Array, callContext?: DhtCallContext) => {

            let targetDescriptor: PeerDescriptor
            // rpc call message

            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            } else { // rpc reply message
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = {
                messageId: v4(), serviceId: this.ownServiceId, body: msgBody,
                messageType: MessageType.RPC, targetDescriptor: targetDescriptor
            }
            this.sendFn(message)
        })
    }

    public handleMessageFromPeer(message: Message): void {
        if (message.serviceId == this.ownServiceId) {
            const context = new DhtCallContext()
            context.incomingSourceDescriptor = message.sourceDescriptor
            this.handleIncomingMessage(message.body, context)
        }
    }
}
