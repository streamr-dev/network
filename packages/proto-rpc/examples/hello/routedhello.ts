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

    const clientCommunicators: { [clientId: string]: RpcCommunicator } = {}

    // Setup server
    const serverCommunicator = new RpcCommunicator()
    const helloService = new HelloService()
    serverCommunicator.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', helloService.sayHello)

    // Setup client1
    const communicator1 = new RpcCommunicator()
    const helloClient1 = new HelloRpcClient(communicator1.getRpcClientTransport())
    clientCommunicators['1'] = communicator1

    // Setup client2
    const communicator2 = new RpcCommunicator()
    const helloClient2 = new HelloRpcClient(communicator2.getRpcClientTransport())
    clientCommunicators['2'] = communicator2

    // Simulate a network connection, in real life the message blobs would be transferred over a network

    serverCommunicator.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, callContext?: CallContext) => {

        // Pass the reply message to the calling client based on sourceId passed in the context
        if (callContext!.sourceId) {
            const clientId = callContext!["sourceId"] as string
            clientCommunicators[clientId].handleIncomingMessage(msgBody)
        }
    })

    communicator1.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, _ucallContext?: CallContext) => {
        const context = new CallContext()

        // Here you would transport the msgBody and the id of the calling client over network to the server
        // ...
        // At the server you would pass the id of the calling client as context information to the server.  
        // The context information gets passed uncahged through the RPC stack, so the reply message can be
        // routed to the correct client. 

        context["sourceId"] = "1"
        serverCommunicator.handleIncomingMessage(msgBody, context)
    })

    communicator2.on(RpcCommunicatorEvents.OUTGOING_MESSAGE, (msgBody: Uint8Array, _ucallContext?: CallContext) => {
        const context = new CallContext()
        context["sourceId"] = "2"
        serverCommunicator.handleIncomingMessage(msgBody, context)
    })

    const result1 = await helloClient1.sayHello({ myName: 'Alice' })
    console.log("Client 1 (Alice) got message from server: " + result1.response.greeting)

    const result2 = await helloClient2.sayHello({ myName: 'Bob' })
    console.log("Client 2 (Bob) got message from server: " + result2.response.greeting)

    communicator1.stop()
    communicator2.stop()
}

run()