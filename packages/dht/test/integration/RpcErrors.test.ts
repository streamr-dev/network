import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { PeerID } from '../../src/helpers/PeerID'
import { ITransport } from '../../src/transport/ITransport'
import { v4 } from 'uuid'
import { DhtRpcOptions, ListeningRpcCommunicator, SimulatorTransport } from '../../src/exports'
import { ProtoRpcClient, toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtRpcServiceClient } from '../../src/proto/DhtRpc.client'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { NodeType, PeerDescriptor, PingRequest, PingResponse } from '../../src/proto/DhtRpc'

describe('RPC errors', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager

    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator

    let client1: ProtoRpcClient<DhtRpcServiceClient>
    //let client2: ProtoRpcClient<DhtRpcServiceClient>

    let simulator: Simulator

    const peerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString("peer1").value,
        type: NodeType.NODEJS,
    }

    const peerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString("peer2").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    const serviceId = 'test'

    beforeEach(async () => {

        simulator = new Simulator(LatencyType.FIXED, 500)
        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        manager1 = new ConnectionManager({ transportLayer: connectorTransport1 })
        rpcCommunicator1 = new ListeningRpcCommunicator(serviceId, manager1)
        client1 = toProtoRpcClient(new DhtRpcServiceClient(rpcCommunicator1.getRpcClientTransport()))

        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        manager2 = new ConnectionManager({ transportLayer: connectorTransport2 })
        rpcCommunicator2 = new ListeningRpcCommunicator(serviceId, manager2)
        //client2 = toProtoRpcClient(new DhtRpcServiceClient(rpcCommunicator2.getRpcClientTransport()))

        await manager1.start((_msg) => peerDescriptor1)
        await manager2.start((_msg) => peerDescriptor2)

    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
        simulator.stop()
    })

    it('Can make a RPC call over WebRTC', async () => {
        const ping = async (request: PingRequest, _context: ServerCallContext):
            Promise<PingResponse> => {
            const response: PingResponse = {
                requestId: request.requestId
            }
            return response
        }

        rpcCommunicator2.registerRpcMethod(PingRequest, PingResponse, 'ping', ping)

        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }

        const response = await client1.ping(request, options)

        expect(response.requestId).toEqual(request.requestId)
    }, 60000)

    it('Throws an exception if RPC method is not defined', async () => {

        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }

        await expect(client1.ping(request, options))
            .rejects.toThrow('Server does not implement method ping')
    }, 60000)

    /*
    it.only('Throws a client-side exception if WebRTC connection fails', async () => {

        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }
        await connectorTransport1.stop()
        await manager2.stop()
        
        const result = await client1.ping(request, options)
        
    }, 60000)

    it('Disconnects WebRtcConnection while being connected', async () => {
        
        const rpcMessage: RpcMessage = {
            header: {},
            body: new Uint8Array(10),
            requestId: v4()
        }

        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: RpcMessage.toBinary(rpcMessage)
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch((e) => {
            expect(e.code).toEqual('CONNECTION_FAILED')
        })
        
        manager1.disconnect(peerDescriptor2!, undefined, 100)
        await disconnectedPromise1

    }, 20000)
    */
})
