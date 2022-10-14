import { ITransport } from './ITransport' 
import { RoutingRpcCommunicator } from "./RoutingRpcCommunicator"
import { RpcCommunicatorConfig } from "@streamr/proto-rpc"
import { Message } from "../proto/DhtRpc"

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    constructor(ownServiceId: string, transport: ITransport, config?: RpcCommunicatorConfig) {
        super(ownServiceId, transport.send, config)
        
        transport.on('message', (msg: Message) => {
            this.handleMessageFromPeer(msg)
        })
    }
}
