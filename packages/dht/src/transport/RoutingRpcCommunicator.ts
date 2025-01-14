import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { RpcCommunicator, RpcCommunicatorOptions } from '@streamr/proto-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { ServiceID } from '../types/ServiceID'
import { DEFAULT_SEND_OPTIONS, SendOptions } from './ITransport'

export class RoutingRpcCommunicator extends RpcCommunicator<DhtCallContext> {
    private ownServiceId: ServiceID
    private sendFn: (msg: Message, opts: SendOptions) => Promise<void>

    constructor(
        ownServiceId: ServiceID,
        sendFn: (msg: Message, opts: SendOptions) => Promise<void>,
        options?: RpcCommunicatorOptions
    ) {
        super(options)
        this.ownServiceId = ownServiceId
        this.sendFn = sendFn

        this.setOutgoingMessageListener((msg: RpcMessage, _requestId: string, callContext?: DhtCallContext) => {
            let targetDescriptor: PeerDescriptor
            // rpc call message
            if (callContext!.targetDescriptor) {
                targetDescriptor = callContext!.targetDescriptor!
            } else {
                // rpc reply message
                targetDescriptor = callContext!.incomingSourceDescriptor!
            }

            const message: Message = {
                messageId: v4(),
                serviceId: this.ownServiceId,
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: msg
                },
                targetDescriptor
            }

            // TODO maybe sendOptions could be a separate block inside callContext
            const sendOpts =
                msg.header.response !== undefined
                    ? {
                          // typically we already have a connection, but if it has disconnected for some reason
                          // the receiver could have gone offline (or it is no longer a neighbor) and therefore there
                          // is no point in trying form a new connection
                          connect: false,
                          // TODO maybe this options could be removed?
                          sendIfStopped: true
                      }
                    : {
                          connect: callContext?.connect ?? DEFAULT_SEND_OPTIONS.connect,
                          sendIfStopped: callContext?.sendIfStopped ?? DEFAULT_SEND_OPTIONS.sendIfStopped
                      }
            return this.sendFn(message, sendOpts)
        })
    }

    public handleMessageFromPeer(message: Message): void {
        if (message.serviceId === this.ownServiceId && message.body.oneofKind === 'rpcMessage') {
            const context = new DhtCallContext()
            context.incomingSourceDescriptor = message.sourceDescriptor
            // TODO should we have some handling for this floating promise?
            this.handleIncomingMessage(message.body.rpcMessage, context)
        }
    }
}
