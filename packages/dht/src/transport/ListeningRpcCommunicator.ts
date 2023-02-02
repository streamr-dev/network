import { ITransport } from './ITransport' 
import { RoutingRpcCommunicator } from "./RoutingRpcCommunicator"
import { RpcCommunicatorConfig } from "@streamr/proto-rpc"
import { Message } from "../proto/packages/dht/protos/DhtRpc"

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    constructor(ownServiceId: string, transport: ITransport, config?: RpcCommunicatorConfig) {
        super(ownServiceId, transport.send, config)
        
        transport.on('message', (msg: Message) => {
            this.handleMessageFromPeer(msg)
        })
    }
}
