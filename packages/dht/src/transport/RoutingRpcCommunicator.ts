import { Message, MessageType, PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { v4 } from "uuid"
import { RpcCommunicator, RpcCommunicatorConfig } from "@streamr/proto-rpc"
import { DhtCallContext } from "../rpc-protocol/DhtCallContext"
import { RpcMessage } from "../proto/packages/proto-rpc/protos/ProtoRpc"

export class RoutingRpcCommunicator extends RpcCommunicator {
    private ownServiceId: string
    private sendFn: (msg: Message, doNotConnect?: boolean) => Promise<void>

    constructor(
        ownServiceId: string,
        sendFn: (msg: Message, doNotConnect?: boolean) => Promise<void>,
        config?: RpcCommunicatorConfig
    ) {
        super(config)
        this.ownServiceId = ownServiceId
        this.sendFn = sendFn

        this.setOutgoingMessageListener((msg: RpcMessage, _requestId: string, callContext?: DhtCallContext) => {
            let targetDescriptor: PeerDescriptor
            // rpc call message

            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            } else { // rpc reply message
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = {
                messageId: v4(), 
                serviceId: this.ownServiceId, 
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: msg
                },
                messageType: MessageType.RPC, 
                targetDescriptor: targetDescriptor
            }

            if (msg.header.response || callContext && callContext.doNotConnect) {
                return this.sendFn(message, true)
            } else {
                return this.sendFn(message)
            }

        })
    }

    public handleMessageFromPeer(message: Message): void {
        if (message.serviceId == this.ownServiceId && message.body.oneofKind === 'rpcMessage') {
            const context = new DhtCallContext()
            context.incomingSourceDescriptor = message.sourceDescriptor
            this.handleIncomingMessage(message.body.rpcMessage, context)
        }
    }
}
