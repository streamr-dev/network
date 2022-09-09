import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import EventEmitter from 'eventemitter3'
import { CallContext, RpcCommunicator } from '../../src'
import { toProtoRpcClient } from '../../src/toProtoRpcClient'
import { Empty } from '../proto/google/protobuf/empty'
import { HelloRequest, HelloResponse } from '../proto/HelloRpc'
import { HelloRpcServiceClient } from '../proto/HelloRpc.client'
import { IHelloRpcService } from '../proto/HelloRpc.server'
import { WakeUpRequest } from '../proto/WakeUpRpc'
import { WakeUpRpcServiceClient } from '../proto/WakeUpRpc.client'
import { IWakeUpRpcService } from '../proto/WakeUpRpc.server'

// Rpc call service
class HelloService implements IHelloRpcService {
    async sayHello(request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        return { greeting: 'Hello ' + request.myName + '!' }
    }
}

interface WakeUpEvent {
    WAKE_UP_CALLED: (reason: string) => void
}
// Rpc notification service
class WakeUpService extends EventEmitter<WakeUpEvent> implements IWakeUpRpcService {
    wakeUp = async (request: WakeUpRequest, _context: ServerCallContext): Promise<Empty> => {
        this.emit('WAKE_UP_CALLED', request.reason)
        const ret: Empty = {}
        return ret
    }
}

describe('toProtoRpcClient', () => {
    it('can make a rpc call', async () => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const helloService = new HelloService()
        communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', helloService.sayHello)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const helloClient = toProtoRpcClient(new HelloRpcServiceClient(communicator2.getRpcClientTransport()))

        // Simulate a network connection, in real life the message blobs would be transferred over a network
        communicator1.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator2.handleIncomingMessage(msgBody)
        })
        communicator2.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator1.handleIncomingMessage(msgBody)
        })

        const { greeting } = await helloClient.sayHello({ myName: 'Alice' })
        expect(greeting).toBe("Hello Alice!")

        communicator1.stop()
        communicator2.stop()
    })

    it('can make a rpc notification', (done) => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const wakeUpService = new WakeUpService()
        communicator1.registerRpcNotification(WakeUpRequest, 'wakeUp', wakeUpService.wakeUp)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const wakeUpClient = toProtoRpcClient(new WakeUpRpcServiceClient(communicator2.getRpcClientTransport()))

        // Simulate a network connection, in real life the message blobs would be transferred over a network
        communicator1.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator2.handleIncomingMessage(msgBody)
        })
        communicator2.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator1.handleIncomingMessage(msgBody)
        })

        wakeUpService.on('WAKE_UP_CALLED', async (reason) => {
            expect(reason).toBe("School")
            communicator1.stop()
            communicator2.stop()
            done()
        })

        wakeUpClient.wakeUp({ reason: 'School' })
    })

    it('making a rpc call with protobuf-ts client throws', (done) => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const helloService = new HelloService()
        communicator1.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', helloService.sayHello)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const helloClient = new HelloRpcServiceClient(communicator2.getRpcClientTransport())

        // Simulate a network connection, in real life the message blobs would be transferred over a network
        communicator1.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator2.handleIncomingMessage(msgBody)
        })
        communicator2.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator1.handleIncomingMessage(msgBody)
        })

        try {
            helloClient.sayHello({ myName: 'Alice' })
        } catch (e) {
            // eslint-disable-next-line max-len
            expect(e.message).toEqual('ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).')
            communicator1.stop()
            communicator2.stop()
            done()
        }
    })

    it('making a rpc notification with protobuf-ts client throws', (done) => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const wakeUpService = new WakeUpService()
        communicator1.registerRpcNotification(WakeUpRequest, 'wakeUp', wakeUpService.wakeUp)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const wakeUpClient = new WakeUpRpcServiceClient(communicator2.getRpcClientTransport())

        // Simulate a network connection, in real life the message blobs would be transferred over a network
        communicator1.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator2.handleIncomingMessage(msgBody)
        })
        communicator2.on('OUTGOING_MESSAGE', (msgBody: Uint8Array, _callContext?: CallContext) => {
            communicator1.handleIncomingMessage(msgBody)
        })

        wakeUpService.on('WAKE_UP_CALLED', async (_reason) => {
            communicator1.stop()
            communicator2.stop()
            done.fail('test did not throw as expected')
        })

        try {
            wakeUpClient.wakeUp({ reason: 'School' })
        } catch (e) {
            // eslint-disable-next-line max-len
            expect(e.message).toEqual('ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).')
            communicator1.stop()
            communicator2.stop()
            done()
        }
    })

})
