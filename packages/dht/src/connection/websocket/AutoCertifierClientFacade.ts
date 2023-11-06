import {
    AutoCertifierClient,
    SessionIdRequest,
    SessionIdResponse, 
    CertifiedSubdomain,
    Certificate,
    AUTOCERTIFIER_SERVICE_ID,
    GetSessionId
} from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../../exports'
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
    (_serviceId: string, rpcMethodName: string, method: GetSessionId) => {
        autoCertifierRpcCommunicator.registerRpcMethod(
            SessionIdRequest,
            SessionIdResponse,
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
    setHost: (host: string) => void
    updateCertificate: (certificate: Certificate) => void
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
        this.rpcCommunicator = new ListeningRpcCommunicator(AUTOCERTIFIER_SERVICE_ID, config.transport)
        this.autoCertifierClient = config.createClientFactory ? config.createClientFactory() 
            : defaultAutoCertifierClientFactory(
                config.subdomainFilePath,
                config.url,
                this.rpcCommunicator,
                config.wsServerPort
            )
    }

    async start(): Promise<void> {
        this.autoCertifierClient.on('updatedSubdomain', (subdomain: CertifiedSubdomain) => {
            logger.trace(`Updating certificate for WSS server`)
            this.setHost(subdomain.subdomain + '.' + subdomain.fqdn)
            this.updateCertificate(subdomain.certificate)
            logger.trace(`Updated certificate for WSS server`)
        })
        await Promise.all([
            waitForEvent3(this.autoCertifierClient as any, 'updatedSubdomain', START_TIMEOUT),
            this.autoCertifierClient.start()
        ])
    }

    stop(): void {
        this.autoCertifierClient.stop()
        this.rpcCommunicator.destroy()
    }

}
