import { AutoCertifierClient, SessionIdRequest, SessionIdResponse, CertifiedSubdomain, Certificate } from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../../exports'
import { Logger, waitForEvent3 } from '@streamr/utils'

const START_TIMEOUT = 60 * 1000

const defaultAutoCertifierClientFactory = (
    filePath: string,
    autocertifierUrl: string,
    autocertifierRpcCommunicator: ListeningRpcCommunicator,
    wsServerPort: number
) => new AutoCertifierClient(
    filePath,
    wsServerPort,
    autocertifierUrl, (_, rpcMethodName, method) => {
        autocertifierRpcCommunicator.registerRpcMethod(
            SessionIdRequest,
            SessionIdResponse,
            rpcMethodName,
            method
        )                        
    })

export interface IAutoCertifierClient {
    start(): Promise<void>
    stop(): void
    on(eventName: string, cb: (subdomain: CertifiedSubdomain) => void): void
}

interface AutoCertifierClientFacadeConfig {
    autocertifierUrl: string
    autocertifiedSubdomainFilePath: string
    autocertifierRpcCommunicator: ListeningRpcCommunicator
    wsServerPort: number
    setHost: (host: string) => void
    updateCertificate: (certificate: Certificate) => void
    createClientFactory?: () => IAutoCertifierClient
}

const logger = new Logger(module)

export class AutoCertifierClientFacade {

    private autocertifierClient: IAutoCertifierClient
    private readonly setHost: (host: string) => void
    private readonly updateCertificate: (certificate: Certificate) => void

    constructor(config: AutoCertifierClientFacadeConfig) {
        this.setHost = config.setHost
        this.updateCertificate = config.updateCertificate
        this.autocertifierClient = config.createClientFactory ? config.createClientFactory() 
            : defaultAutoCertifierClientFactory(
                config.autocertifiedSubdomainFilePath,
                config.autocertifierUrl,
                config.autocertifierRpcCommunicator,
                config.wsServerPort
            )
    }

    async start(): Promise<void> {
        this.autocertifierClient.on('updatedSubdomain', (subdomain: CertifiedSubdomain) => {
            logger.trace(`Updating certificate for WSS server`)
            this.setHost(subdomain.subdomain + '.' + subdomain.fqdn)
            this.updateCertificate(subdomain.certificate)
            logger.trace(`Updated certificate for WSS server`)
        })
        await Promise.all([
            waitForEvent3(this.autocertifierClient as any, 'updatedSubdomain', START_TIMEOUT),
            this.autocertifierClient.start()
        ])
    }

    stop(): void {
        this.autocertifierClient.stop()
    }

}
