import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import EventEmitter from 'eventemitter3'
import { RpcCommunicator } from '../../src/RpcCommunicator'
import { ProtoCallContext } from '../../src/ProtoCallContext'
import { toProtoRpcClient } from '../../src/toProtoRpcClient'
import { Empty } from '../proto/google/protobuf/empty'
import { HelloRequest, HelloResponse } from '../proto/HelloRpc'
import { HelloRpcServiceClient } from '../proto/HelloRpc.client'
import { IHelloRpcService } from '../proto/HelloRpc.server'
import { WakeUpRequest } from '../proto/WakeUpRpc'
import { WakeUpRpcServiceClient } from '../proto/WakeUpRpc.client'
import { IWakeUpRpcService } from '../proto/WakeUpRpc.server'
import { RpcMessage } from '../../generated/ProtoRpc'
import { IOptionalService } from '../proto/TestProtos.server'
import { OptionalRequest, OptionalResponse } from '../proto/TestProtos'
import { OptionalServiceClient } from '../proto/TestProtos.client'

// Rpc call service
/* eslint-disable class-methods-use-this */
class HelloService implements IHelloRpcService {
    async sayHello(request: HelloRequest, _context: ServerCallContext): Promise<HelloResponse> {
        return { greeting: 'Hello ' + request.myName + '!' }
    }
}

interface WakeUpEvents {
    wakeUpCalled: (reason: string) => void
}
// Rpc notification service
class WakeUpService extends EventEmitter<WakeUpEvents> implements IWakeUpRpcService {
    wakeUp = async (request: WakeUpRequest, _context: ServerCallContext): Promise<Empty> => {
        this.emit('wakeUpCalled', request.reason)
        const ret: Empty = {}
        return ret
    }
}

// Rpc call service with response of only optional fields
class OptionalService implements IOptionalService {
    async getOptional(_request: OptionalRequest, _context: ServerCallContext): Promise<OptionalResponse> {
        return {}
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
        communicator1.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator2.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )
        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        const { greeting } = await helloClient.sayHello({ myName: 'Alice' })
        expect(greeting).toBe('Hello Alice!')

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
        communicator1.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator2.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )
        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        wakeUpService.on('wakeUpCalled', async (reason) => {
            expect(reason).toBe('School')
            communicator1.stop()
            communicator2.stop()
            done()
        })

        wakeUpClient.wakeUp({ reason: 'School' })
    })

    it('can make a rpc call where all response fields are optional', async () => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const optionalService = new OptionalService()
        communicator1.registerRpcMethod(OptionalRequest, OptionalResponse, 'getOptional', optionalService.getOptional)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const optionalClient = toProtoRpcClient(new OptionalServiceClient(communicator2.getRpcClientTransport()))

        // Simulate a network connection, in real life the message blobs would be transferred over a network
        communicator1.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator2.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )
        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        const { someOptionalField } = await optionalClient.getOptional({ someOptionalField: 'something' })

        expect(someOptionalField).toBe(undefined)

        communicator1.stop()
        communicator2.stop()
    })

    it('Handles client-side exceptions on RPC calls', async () => {
        // Setup client
        const communicator2 = new RpcCommunicator()
        const helloClient = toProtoRpcClient(new HelloRpcServiceClient(communicator2.getRpcClientTransport()))

        communicator2.setOutgoingMessageListener(
            async (_message: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                throw new Error('testException')
            }
        )

        await expect(helloClient.sayHello({ myName: 'School' })).rejects.toThrow('testException')
    })

    it('Awaiting RPC notifications returns when using events', async () => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const wakeUpService = new WakeUpService()
        communicator1.registerRpcNotification(WakeUpRequest, 'wakeUp', wakeUpService.wakeUp)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const wakeUpClient = toProtoRpcClient(new WakeUpRpcServiceClient(communicator2.getRpcClientTransport()))

        // Simulate a network connection, in real life the message blobs would be transferred over a network

        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        await wakeUpClient.wakeUp({ reason: 'School' })
    })

    it('Awaiting RPC notifications returns when using outgoingMessageListener', async () => {
        // Setup server
        const communicator1 = new RpcCommunicator()
        const wakeUpService = new WakeUpService()
        communicator1.registerRpcNotification(WakeUpRequest, 'wakeUp', wakeUpService.wakeUp)

        // Setup client
        const communicator2 = new RpcCommunicator()
        const wakeUpClient = toProtoRpcClient(new WakeUpRpcServiceClient(communicator2.getRpcClientTransport()))

        // Simulate a network connection, in real life the message blobs would be transferred over a network

        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        await wakeUpClient.wakeUp({ reason: 'School' })
    })

    it('Handles client-side exceptions on RPC notifications', async () => {
        // Setup client
        const communicator2 = new RpcCommunicator()
        const wakeUpClient = toProtoRpcClient(new WakeUpRpcServiceClient(communicator2.getRpcClientTransport()))

        communicator2.setOutgoingMessageListener(
            async (_message: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                throw new Error('test exception')
            }
        )

        await expect(wakeUpClient.wakeUp({ reason: 'School' })).rejects.toThrow('test exception')
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
        communicator1.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator2.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )
        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        try {
            helloClient.sayHello({ myName: 'Alice' })
        } catch (e) {
            expect(e.message).toEqual(
                // eslint-disable-next-line max-len
                'ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).'
            )
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
        communicator1.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator2.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )
        communicator2.setOutgoingMessageListener(
            async (msg: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                communicator1.handleIncomingMessage(msg, new ProtoCallContext())
            }
        )

        wakeUpService.on('wakeUpCalled', async (_reason) => {
            communicator1.stop()
            communicator2.stop()
            done.fail('test did not throw as expected')
        })

        try {
            wakeUpClient.wakeUp({ reason: 'School' })
        } catch (e) {
            expect(e.message).toEqual(
                // eslint-disable-next-line max-len
                'ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).'
            )
            communicator1.stop()
            communicator2.stop()
            done()
        }
    })
})
