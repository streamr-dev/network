import { IMessageType } from '@protobuf-ts/runtime'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ITransport, ListeningRpcCommunicator } from '@streamr/dht'

export const SERVICE_ID = 'external-network-service'

export class ExternalNetworkRpc {

    private readonly rpcCommunicator: ListeningRpcCommunicator

    constructor(transport: ITransport) {
        this.rpcCommunicator = new ListeningRpcCommunicator(SERVICE_ID, transport)
    }

    registerRpcMethod<
        RequestClass extends IMessageType<RequestType>,
        ResponseClass extends IMessageType<ResponseType>,
        RequestType extends object,
        ResponseType extends object
    >(
        request: RequestClass,
        response: ResponseClass,
        name: string, 
        fn: (req: RequestType, context: ServerCallContext) => Promise<ResponseType>
    ): void {
        this.rpcCommunicator.registerRpcMethod(request, response, name, fn)
    }

    destroy(): void {
        this.rpcCommunicator.destroy()
    }

}
