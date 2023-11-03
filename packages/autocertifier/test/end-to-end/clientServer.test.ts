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
import os from 'os'
import fs from 'fs'
import { RestServer } from '../../src/RestServer'
import { 
    CertifiedSubdomain,
    Session,
    AutoCertifierClient,
    createSelfSignedCertificate,
    SessionIdRequest,
    SessionIdResponse,
    GetSessionId
} from '@streamr/autocertifier-client'
import { v4 } from 'uuid'
import { Logger } from '@streamr/utils'
import { runStreamrChallenge } from '../../src/StreamrChallenger'

const logger = new Logger(module)

let server: RestServer
const dir = os.tmpdir()
let certifiedSubdomain: CertifiedSubdomain

const createTestSubdomain = () => {
    const fakeCerts = createSelfSignedCertificate('localhost', 1200)
    certifiedSubdomain = { 
        fqdn: 'localhost',
        subdomain: 'mock',
        token: 'token',
        certificate: {
            cert: fakeCerts.serverCert,
            key: fakeCerts.serverKey
        }
    }
}

describe('clientServer', () => {

    const restServerPort = '3000'

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester1').value,
        type: NodeType.NODEJS
    }
   
    const simulator = new Simulator()
    const mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)

    let clientConnectionManager: ConnectionManager
    let clientRpcCommunicator: ListeningRpcCommunicator | undefined

    const subdomainPath = os.tmpdir() + 'subdomain.json'

    let client: AutoCertifierClient

    beforeAll(async () => {

        if (fs.existsSync(subdomainPath)) {
            fs.unlinkSync(subdomainPath)
        }
        createTestSubdomain()
        server = new RestServer(
            'localhost',
            '127.0.0.1',
            restServerPort,
            dir + '/restServerCaCert.pem',
            dir + '/restServerCaKey.pem',
            dir + '/restServerCert.pem',
            dir + '/restServerKey.pem',
            {
                async createSession(): Promise<Session> {
                    return { sessionId: v4() }
                },
                async createNewSubdomainAndCertificate(
                    ip: string,
                    _port: string,
                    streamrWebsocketPort:
                    string,
                    sessionId: string
                ): Promise<CertifiedSubdomain> {
                    await runStreamrChallenge(ip, streamrWebsocketPort, sessionId)
                    return certifiedSubdomain
                },
                async createNewCertificateForSubdomain(): Promise<CertifiedSubdomain> {
                    return certifiedSubdomain
                },
                async updateSubdomainIpAndPort() {
                    // do nothing
                }
            })
        await server.start()

        clientConnectionManager = new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
                transport: mockTransport,
                websocketHost: '127.0.0.1',
                websocketPortRange: { min: 9991, max: 9991 },
                createLocalPeerDescriptor: () => mockPeerDescriptor1
            }),
            metricsContext: {} as any
        })

        await clientConnectionManager.start()
        const peerDescriptor = clientConnectionManager.getLocalPeerDescriptor()
        expect(peerDescriptor.websocket!.host).toEqual('127.0.0.1')
    })

    afterAll(async () => {
        await clientConnectionManager.stop()
        await server.stop()
    })
    
    afterEach(async () => {
        if (fs.existsSync(subdomainPath)) {
            fs.unlinkSync(subdomainPath)
        }

        if (clientRpcCommunicator) {
            clientRpcCommunicator.stop()
        }
        await client.stop()
    })
     
    it('The client can start', (done) => {
        const streamrWebSocketPort = clientConnectionManager.getLocalPeerDescriptor().websocket!.port
        const autoCertifierUrl = 'https://localhost:' + restServerPort

        client = new AutoCertifierClient(
            subdomainPath,
            streamrWebSocketPort,
            autoCertifierUrl,
            (serviceId: string, rpcMethodName: string, method: GetSessionId) => {
                clientRpcCommunicator = new ListeningRpcCommunicator(serviceId, clientConnectionManager)
                clientRpcCommunicator.registerRpcMethod(
                    SessionIdRequest,
                    SessionIdResponse,
                    rpcMethodName,
                    method
                )
            })

        client.on('updatedSubdomain', (subdomain: CertifiedSubdomain) => {
            logger.info(JSON.stringify(subdomain))
            expect(subdomain).toEqual(certifiedSubdomain)
            done()
        })

        client.start().then(() => { return }).catch((e) => { done.fail(e) })
    })

    it('Starting the client throws an exception if AutoCertifier cannot connect to it using WebSocket', async () => {
        const streamrWebSocketPort = 100
        const autoCertifierUrl = 'https://localhost:' + restServerPort

        client = new AutoCertifierClient(
            subdomainPath,
            streamrWebSocketPort,
            autoCertifierUrl,
            (serviceId: string, rpcMethodName: string, method: GetSessionId) => {
                clientRpcCommunicator = new ListeningRpcCommunicator(serviceId, clientConnectionManager)
                clientRpcCommunicator.registerRpcMethod(
                    SessionIdRequest,
                    SessionIdResponse,
                    rpcMethodName,
                    method
                )
            })
        
        await expect(client.start()).rejects.toThrow('Autocertifier failed to connect')
        
    })

})
