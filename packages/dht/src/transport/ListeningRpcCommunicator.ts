import { ITransport } from './ITransport' 
import { RoutingRpcCommunicator } from './RoutingRpcCommunicator'
import { RpcCommunicatorConfig } from '@streamr/proto-rpc'
import { Message } from '../proto/packages/dht/protos/DhtRpc'
import { ServiceID } from '../types/ServiceID'

export class ListeningRpcCommunicator extends RoutingRpcCommunicator {
    private readonly transport: ITransport
    private readonly listener: (msg: Message) => void

    constructor(ownServiceId: ServiceID, transport: ITransport, config?: RpcCommunicatorConfig) {
        super(ownServiceId, (msg, doNotConnect) => transport.send(msg, doNotConnect), config)
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
