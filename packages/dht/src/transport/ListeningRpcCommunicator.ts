import { ITransport } from './ITransport' 
import { RoutingRpcCommunicator } from './RoutingRpcCommunicator'
import { RpcCommunicatorConfig } from '@streamr/proto-rpc'
import { Message } from '../proto/packages/dht/protos/DhtRpc'

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    private transport: ITransport | undefined
    private readonly handler: (msg: Message) => void
    constructor(ownServiceId: string, transport: ITransport, config?: RpcCommunicatorConfig) {
        super(ownServiceId, transport.send, config)
        this.handler = (msg: Message) => {
            this.handleMessageFromPeer(msg)
        }
        this.transport = transport
        transport.on('message', this.handler) 
    }

    destroy(): void {
        this.transport!.off('message', this.handler)
        this.transport = undefined
        this.stop()
    }
}
