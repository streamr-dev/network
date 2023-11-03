import { ITransport } from './ITransport' 
import { RoutingRpcCommunicator } from './RoutingRpcCommunicator'
import { RpcCommunicatorConfig } from '@streamr/proto-rpc'
import { Message } from '../proto/packages/dht/protos/DhtRpc'

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    private readonly transport: ITransport
    private readonly listener: (msg: Message) => void

    constructor(ownServiceId: string, transport: ITransport, config?: RpcCommunicatorConfig) {
        super(ownServiceId, transport.send, config)
        this.listener = (msg: Message) => {
            this.handleMessageFromPeer(msg)
        }
        this.transport = transport
        transport.on('message', this.listener) 
    }

    destroy(): void {
        this.transport.off('message', this.listener)
        this.stop()
    }
}
