import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RpcCommunicator, RpcCommunicatorEvents, CallContext } from '@streamr/proto-rpc'
import { HelloRequest, HelloResponse } from './proto/HelloRpc'
import { IHelloRpc } from './proto/HelloRpc.server'
import { HelloRpcClient } from './proto/HelloRpc.client'

// Rpc service
class HelloService implements IHelloRpc {
    async sayHello(request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        return { greeting: 'Hello ' + request.myName + '!' }
    }
}

const run = async () => {
    // Setup server
    const communicator2 = new RpcCommunicator()
    const helloClient = new HelloRpcClient(communicator2.getRpcClientTransport())

    // Setup client
    const communicator1 = new RpcCommunicator()
    const helloService = new HelloService()
    communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', helloService.sayHello)

    // Simulate a network connection, in real life the message blobs would be transferred over a network
    communicator1.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, _ucallContext?: CallContext) => {
        communicator2.handleIncomingMessage(msgBody)
    })
    communicator2.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, _ucallContext?: CallContext) => {
        communicator1.handleIncomingMessage(msgBody)
    })

    const result = await helloClient.sayHello({ myName: 'Alice' })
    console.log(result.response.greeting)
}

run()