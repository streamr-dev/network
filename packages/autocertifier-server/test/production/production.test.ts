import { 
    ConnectionManager,
    ListeningRpcCommunicator,
    NodeType,
    PeerDescriptor,
    PeerID,
    Simulator,
    SimulatorTransport,
    DefaultConnectorFacade
} from '@streamr/dht'
import { AutoCertifierClient, HasSessionRequest, HasSessionResponse } from '@streamr/autocertifier-client'
import os from 'os'
import fs from 'fs'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

describe('production', () => {

    const restServerUrl = process.env['REST_SERVER_URL']
    if (!restServerUrl) {
        throw new Error('REST_SERVER_URL environment variable is not set')
    }

    if (!restServerUrl) {
        throw new Error('REST_SERVER_CA_CERT_PATH environment variable is not set')
    }
    const subdomainPath = os.tmpdir() + '/subdomain.json'

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester1').value,
        type: NodeType.NODEJS
    }

    const simulator = new Simulator()
    const mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)

    let clientConnectionManager: ConnectionManager
    let clientRpcCommunicator: ListeningRpcCommunicator | undefined

    let client: AutoCertifierClient

    beforeEach(async () => {

        if (fs.existsSync(subdomainPath)) {
            fs.unlinkSync(subdomainPath)
        }

        clientConnectionManager = new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
                transport: mockTransport,
                websocketHost: '127.0.0.1',
                websocketPortRange: { min: 9995, max: 9995 },
                createLocalPeerDescriptor: () => mockPeerDescriptor1
            }),
            metricsContext: {} as any
        })

        await clientConnectionManager.start()
        const peerDescriptor = clientConnectionManager.getLocalPeerDescriptor()
        expect(peerDescriptor.websocket!.host).toEqual('127.0.0.1')
    })

    afterEach(async () => {
        if (fs.existsSync(subdomainPath)) {
            fs.unlinkSync(subdomainPath)
        }

        if (clientRpcCommunicator) {
            await clientRpcCommunicator.stop()
        }
        await clientConnectionManager.stop()
        await client.stop()
    })

    it('The client can start', (done) => {
        const streamrWebSocketPort = clientConnectionManager.getLocalPeerDescriptor().websocket!.port

        logger.info(subdomainPath)
        logger.info(restServerUrl)
        
        client = new AutoCertifierClient(subdomainPath, streamrWebSocketPort,
            restServerUrl, (serviceId, rpcMethodName, method) => {
                clientRpcCommunicator = new ListeningRpcCommunicator(serviceId, clientConnectionManager)
                clientRpcCommunicator.registerRpcMethod(
                    HasSessionRequest,
                    HasSessionResponse,
                    rpcMethodName,
                    method
                )
            })

        client.on('updatedSubdomain', (subdomain) => {
            logger.info('received a subdomain')
            logger.info(JSON.stringify(subdomain))
            done()
        })

        client.start().then(() => { return }).catch((e) => {
            expect(e).toBeFalsy()
        })
    }, 120000)

    it('The client can start if the subdomain already exits', async () => {
        const streamrWebSocketPort = clientConnectionManager.getLocalPeerDescriptor().websocket!.port

        logger.info(subdomainPath)
        logger.info(restServerUrl)
        
        client = new AutoCertifierClient(subdomainPath, streamrWebSocketPort,
            restServerUrl, (serviceId, rpcMethodName, method) => {
                clientRpcCommunicator = new ListeningRpcCommunicator(serviceId, clientConnectionManager)
                clientRpcCommunicator.registerRpcMethod(
                    HasSessionRequest,
                    HasSessionResponse,
                    rpcMethodName,
                    method
                )
            })

        await client.start()
        await client.stop()
        await client.start()

    }, 120000)
})
