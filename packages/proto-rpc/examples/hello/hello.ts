import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
// eslint-disable-next-line import/no-extraneous-dependencies
import { RpcCommunicator, ProtoCallContext, toProtoRpcClient } from '@streamr/proto-rpc'
import { HelloRequest, HelloResponse } from './proto/HelloRpc'
import { IHelloRpcService } from './proto/HelloRpc.server'
import { HelloRpcServiceClient } from './proto/HelloRpc.client'

// Rpc service
/* eslint-disable class-methods-use-this */
class HelloService implements IHelloRpcService {
    async sayHello(request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        return { greeting: 'Hello ' + request.myName + '!' }
    }
}

const run = async () => {
    // Setup server
    const communicator1 = new RpcCommunicator()
    const helloService = new HelloService()
    communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', helloService.sayHello)

    // Setup client
    const communicator2 = new RpcCommunicator()
    const helloClient = toProtoRpcClient(new HelloRpcServiceClient(communicator2.getRpcClientTransport()))

    // Simulate a network connection, in real life the message blobs would be transferred over a network
    communicator1.on('outgoingMessage', (msgBody: Uint8Array, _requestId: string, _ucallContext?: ProtoCallContext) => {
        communicator2.handleIncomingMessage(msgBody)
    })
    communicator2.on('outgoingMessage', (msgBody: Uint8Array, _requestId: string, _ucallContext?: ProtoCallContext) => {
        communicator1.handleIncomingMessage(msgBody)
    })

    const { greeting } = await helloClient.sayHello({ myName: 'Alice' })
    //const { greeting } = await results.response
    // eslint-disable-next-line no-console
    console.log(greeting)

    communicator1.stop()
    communicator2.stop()
}

run()
