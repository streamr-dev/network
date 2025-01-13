import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { ITransport } from '../../src/transport/ITransport'
import { v4 } from 'uuid'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DhtRpcOptions } from '../../src/rpc-protocol/DhtRpcOptions'
import { ListeningRpcCommunicator } from '../../src/transport/ListeningRpcCommunicator'
import { ProtoRpcClient, toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtNodeRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { PeerDescriptor, PingRequest, PingResponse } from '../../generated/packages/dht/protos/DhtRpc'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MetricsContext } from '@streamr/utils'
import { createMockPeerDescriptor } from '../utils/utils'

const SERVICE_ID = 'test'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, transport: ITransport) => {
    return new ConnectionManager({
        createConnectorFacade: () =>
            new DefaultConnectorFacade({
                transport,
                createLocalPeerDescriptor: async () => localPeerDescriptor
            }),
        metricsContext: new MetricsContext(),
        allowIncomingPrivateConnections: false
    })
}

describe('RPC connections over WebRTC', () => {
    let manager1: ConnectionManager
    let manager2: ConnectionManager
    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator
    let client1: ProtoRpcClient<DhtNodeRpcClient>
    let simulator: Simulator
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.FIXED, 50)
        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await connectorTransport1.start()
        manager1 = createConnectionManager(peerDescriptor1, connectorTransport1)
        rpcCommunicator1 = new ListeningRpcCommunicator(SERVICE_ID, manager1)
        client1 = toProtoRpcClient(new DhtNodeRpcClient(rpcCommunicator1.getRpcClientTransport()))

        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await connectorTransport2.start()
        manager2 = createConnectionManager(peerDescriptor2, connectorTransport2)
        rpcCommunicator2 = new ListeningRpcCommunicator(SERVICE_ID, manager2)

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
        const ping = async (request: PingRequest): Promise<PingResponse> => {
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
    })

    it('Throws an exception if RPC method is not defined', async () => {
        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }

        await expect(client1.ping(request, options)).rejects.toThrow('Server does not implement method ping')
    })

    it('Throws a client-side exception if WebRTC connection fails', async () => {
        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2,
            timeout: 10000
        }
        await manager2.stop()

        await expect(client1.ping(request, options)).rejects.toThrow('Peer disconnected')
    }, 10000)
})
