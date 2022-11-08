import { Message, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { v4 } from "uuid"
import { RpcCommunicator, RpcCommunicatorConfig } from "@streamr/proto-rpc"
import { DhtCallContext } from "../rpc-protocol/DhtCallContext"

export class RoutingRpcCommunicator extends RpcCommunicator {

    constructor(private ownServiceId: string, private sendFn: (msg: Message) => Promise<void>, config?: RpcCommunicatorConfig) {
        super(config)

        this.setOutgoingMessageListener((msgBody: Uint8Array, _requestId: string, callContext?: DhtCallContext) => {

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

            return this.sendFn(message)
            
            /*
            .then(()=> {
                if (callContext?.waitConfirmation) {
                    const confirmation = {}
                    this.handleIncomingMessage(confirmation)
                }
            })
            .catch((e) => {
                this.handleClientError(requestId, e)
            })
            */
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
