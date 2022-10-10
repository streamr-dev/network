/* eslint-disable no-console */

import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RpcCommunicator, ProtoCallContext, toProtoRpcClient, RpcError } from '@streamr/proto-rpc'
import { HelloRequest, HelloResponse } from './proto/ErrorRpc'
import { IErrorRpcService } from './proto/ErrorRpc.server'
import { ErrorRpcServiceClient } from './proto/ErrorRpc.client'

// Rpc service
/* eslint-disable class-methods-use-this */
class ErrorService implements IErrorRpcService {
    async timeout(request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        return new Promise((resolve, _reject) => {
            setTimeout(() => {
                return resolve({ greeting: 'Hello ' + request.myName + '!' })
            }, 2000)
        })
    }
    async serverError(_request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        throw new Error('Server Error')
    }
    async unknownMethod(_request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        throw new RpcError.NotImplemented()
    }
}

const run = async () => {
    // Setup server
    const communicator1 = new RpcCommunicator()
    const errorService = new ErrorService()
    communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'timeout', errorService.timeout)
    communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'serverError', errorService.serverError)

    // Setup client
    const communicator2 = new RpcCommunicator()
    const helloClient = toProtoRpcClient(new ErrorRpcServiceClient(communicator2.getRpcClientTransport()))

    // Simulate a network connection, in real life the message blobs would be transferred over a network
    communicator1.on('outgoingMessage', (msgBody: Uint8Array, _ucallContext?: ProtoCallContext) => {
        communicator2.handleIncomingMessage(msgBody)
    })
    communicator2.on('outgoingMessage', (msgBody: Uint8Array, _ucallContext?: ProtoCallContext) => {
        communicator1.handleIncomingMessage(msgBody)
    })

    try {
        const results = await helloClient.timeout({ myName: 'Alice' })
        console.log(results)
    } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err)
    }

    try {
        const results = await helloClient.serverError({ myName: 'Alice' })
        console.log(results)
    } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err)
    }

    try {
        // UnknownMethod is not registered at the server!
        const results = await helloClient.unknownMethod({ myName: 'Alice' })
        console.log(results)
    } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err)
    }

    communicator1.stop()
    communicator2.stop()
}

run()
