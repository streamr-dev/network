import {
    AutoCertifierClient,
    HasSessionRequest,
    HasSessionResponse, 
    CertifiedSubdomain,
    Certificate,
    SERVICE_ID as AUTO_CERTIFIER_SERVICE_ID,
    HasSession
} from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Logger, waitForEvent3 } from '@streamr/utils'
import { ITransport } from '../../transport/ITransport' 

const START_TIMEOUT = 60 * 1000

const defaultAutoCertifierClientFactory = (
    filePath: string,
    autoCertifierUrl: string,
    autoCertifierRpcCommunicator: ListeningRpcCommunicator,
    wsServerPort: number
) => new AutoCertifierClient(
    filePath,
    wsServerPort,
    autoCertifierUrl, 
    (_serviceId: string, rpcMethodName: string, method: HasSession) => {
        autoCertifierRpcCommunicator.registerRpcMethod(
            HasSessionRequest,
            HasSessionResponse,
            rpcMethodName,
            method
        )                       
    }
)

export interface IAutoCertifierClient {
    start(): Promise<void>
    stop(): void
    on(eventName: string, cb: (subdomain: CertifiedSubdomain) => void): void
}

interface AutoCertifierClientFacadeConfig {
    url: string
    subdomainFilePath: string
    transport: ITransport
    wsServerPort: number
    // TODO: setHost and updateCertificate could be passed in a single onCertificateUpdated function.
    setHost: (host: string) => void
    updateCertificate: (certificate: Certificate) => void
    // TOD: could just pass the client?
    createClientFactory?: () => IAutoCertifierClient
}

const logger = new Logger(module)

export class AutoCertifierClientFacade {

    private autoCertifierClient: IAutoCertifierClient
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly setHost: (host: string) => void
    private readonly updateCertificate: (certificate: Certificate) => void

    constructor(config: AutoCertifierClientFacadeConfig) {
        this.setHost = config.setHost
        this.updateCertificate = config.updateCertificate
        this.rpcCommunicator = new ListeningRpcCommunicator(AUTO_CERTIFIER_SERVICE_ID, config.transport)
        this.autoCertifierClient = config.createClientFactory ? config.createClientFactory() 
            : defaultAutoCertifierClientFactory(
                config.subdomainFilePath,
                config.url,
                this.rpcCommunicator,
                config.wsServerPort
            )
    }

    async start(): Promise<void> {
        this.autoCertifierClient.on('updatedCertificate', (subdomain: CertifiedSubdomain) => {
            this.setHost(subdomain.fqdn)
            this.updateCertificate(subdomain.certificate)
            logger.trace(`Updated certificate`)
        })
        await Promise.all([
            waitForEvent3(this.autoCertifierClient as any, 'updatedCertificate', START_TIMEOUT),
            this.autoCertifierClient.start()
        ])
    }

    stop(): void {
        this.autoCertifierClient.stop()
        this.rpcCommunicator.destroy()
    }

}
