import { SERVICE_ID, HasSessionRequest, HasSessionResponse } from '@streamr/autocertifier-client'
import { runStreamrChallenge } from '../../src/StreamrChallenger'
import {
    ConnectionManager,
    DefaultConnectorFacade,
    ListeningRpcCommunicator,
    NodeType,
    PeerDescriptor,
    Simulator,
    SimulatorTransport,
    randomDhtAddress,
    toDhtAddressRaw
} from '@streamr/dht'
import path from 'path'
import { MetricsContext, until } from '@streamr/utils'

describe('StreamrChallenger', () => {
    let challengedClientTransport: ConnectionManager
    let challengedClient: ListeningRpcCommunicator
    let simulator: Simulator
    let mockTransport: SimulatorTransport

    const mockPeerDescriptor1: PeerDescriptor = {
        nodeId: toDhtAddressRaw(randomDhtAddress()),
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 12323,
            tls: false
        }
    }
    const sessionId = 'sessionId'
    const rpcMethod = async (): Promise<HasSessionResponse> => {
        return {
            sessionId
        }
    }

    beforeEach(async () => {
        simulator = new Simulator()
        mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)
        await mockTransport.start()
        challengedClientTransport = new ConnectionManager({
            createConnectorFacade: () =>
                new DefaultConnectorFacade({
                    transport: mockTransport,
                    tlsCertificate: {
                        privateKeyFileName: path.join(__dirname, '../utils/self-signed-certs/key.pem'),
                        certFileName: path.join(__dirname, '../utils/self-signed-certs/certificate.pem')
                    },
                    websocketHost: '127.0.0.1',
                    websocketPortRange: { min: 12323, max: 12323 },
                    createLocalPeerDescriptor: async () => mockPeerDescriptor1
                }),
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: false
        })
        await challengedClientTransport.start()
        challengedClient = new ListeningRpcCommunicator(SERVICE_ID, challengedClientTransport)
        challengedClient.registerRpcMethod(HasSessionRequest, HasSessionResponse, 'hasSession', rpcMethod)
    })

    afterEach(async () => {
        await challengedClientTransport.stop()
        await mockTransport.stop()
        simulator.stop()
    })

    it('Happy path', async () => {
        await runStreamrChallenge('127.0.0.1', '12323', sessionId)
        await until(() => challengedClientTransport.getConnections().length === 0)
    })
})
