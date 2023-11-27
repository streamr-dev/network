import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { PeerID } from '../../src/helpers/PeerID'
import { ITransport } from '../../src/transport/ITransport'
import { v4 } from 'uuid'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DhtRpcOptions } from '../../src/rpc-protocol/DhtRpcOptions'
import { ListeningRpcCommunicator } from '../../src/transport/ListeningRpcCommunicator'
import { ProtoRpcClient, toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtNodeRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { NodeType, PeerDescriptor, PingRequest, PingResponse } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MetricsContext } from '@streamr/utils'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, transport: ITransport) => {
    return new ConnectionManager({
        createConnectorFacade: () => new DefaultConnectorFacade({
            transport,
            createLocalPeerDescriptor: () => localPeerDescriptor
        }),
        metricsContext: new MetricsContext()
    })
}

describe('RPC connections over WebRTC', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager

    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator

    let client1: ProtoRpcClient<DhtNodeRpcClient>
    //let client2: ProtoRpcClient<DhtNodeRpcClient>

    let simulator: Simulator

    const peerDescriptor1: PeerDescriptor = {
        nodeId: PeerID.fromString('peer1').value,
        type: NodeType.NODEJS,
    }

    const peerDescriptor2: PeerDescriptor = {
        nodeId: PeerID.fromString('peer2').value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport

    const serviceId = 'test'

    beforeEach(async () => {

        simulator = new Simulator(LatencyType.FIXED, 50)
        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await connectorTransport1.start()
        manager1 = createConnectionManager(peerDescriptor1, connectorTransport1)
        rpcCommunicator1 = new ListeningRpcCommunicator(serviceId, manager1)
        client1 = toProtoRpcClient(new DhtNodeRpcClient(rpcCommunicator1.getRpcClientTransport()))

        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await connectorTransport2.start()
        manager2 = createConnectionManager(peerDescriptor2, connectorTransport2)
        rpcCommunicator2 = new ListeningRpcCommunicator(serviceId, manager2)
        //client2 = toProtoRpcClient(new DhtNodeRpcClient(rpcCommunicator2.getRpcClientTransport()))

        await manager1.start()
        await manager2.start()

    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
        await connectorTransport1.stop()
        await connectorTransport2.stop()
        simulator.stop()
    })

    it('Can make a RPC call over WebRTC', async () => {
        const ping = async (request: PingRequest):
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
    
    TODO enable these tests (NET-1177)

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

    it('Disconnects WebrtcConnection while being connected', async () => {
        
        const rpcMessage: RpcMessage = {
            header: {},
            body: new Uint8Array(10),
            requestId: v4()
        }

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: RpcMessage.toBinary(rpcMessage)
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', () => {
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
