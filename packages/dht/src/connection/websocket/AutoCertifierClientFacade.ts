import {
    AutoCertifierClient,
    HasSessionRequest,
    HasSessionResponse, 
    CertifiedSubdomain,
    SERVICE_ID as AUTO_CERTIFIER_SERVICE_ID,
    HasSession
} from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Logger, waitForEvent3 } from '@streamr/utils'
import { ITransport } from '../../transport/ITransport' 

const START_TIMEOUT = 60 * 1000

const defaultAutoCertifierClientFactory = (
    configFile: string,
    autoCertifierUrl: string,
    autoCertifierRpcCommunicator: ListeningRpcCommunicator,
    wsServerPort: number,
    getOwnPeerId: () => string
) => new AutoCertifierClient(
    configFile,
    wsServerPort,
    autoCertifierUrl, 
    (_serviceId: string, rpcMethodName: string, method: HasSession) => {
        autoCertifierRpcCommunicator.registerRpcMethod(
            HasSessionRequest,
            HasSessionResponse,
            rpcMethodName,
            method
        )                       
    },
    getOwnPeerId
)

export interface IAutoCertifierClient {
    start(): Promise<void>
    stop(): void
    on(eventName: string, cb: (subdomain: CertifiedSubdomain) => void): void
}

interface AutoCertifierClientFacadeConfig {
    url: string
    configFile: string
    transport: ITransport
    wsServerPort: number
    // TODO: setHost and updateCertificate could be passed in a single onCertificateUpdated function.
    setHost: (host: string) => void
    updateCertificate: (certificate: string, privateKey: string) => void
    // TOD: could just pass the client?
    createClientFactory?: () => IAutoCertifierClient
    getOwnPeerId: () => string
}

const logger = new Logger(module)

export class AutoCertifierClientFacade {

    private autoCertifierClient: IAutoCertifierClient
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly setHost: (host: string) => void
    private readonly updateCertificate: (certificate: string, privateKey: string) => void

    constructor(config: AutoCertifierClientFacadeConfig) {
        this.setHost = config.setHost
        this.updateCertificate = config.updateCertificate
        this.rpcCommunicator = new ListeningRpcCommunicator(AUTO_CERTIFIER_SERVICE_ID, config.transport)
        this.autoCertifierClient = config.createClientFactory ? config.createClientFactory() 
            : defaultAutoCertifierClientFactory(
                config.configFile,
                config.url,
                this.rpcCommunicator,
                config.wsServerPort,
                config.getOwnPeerId
            )
    }

    async start(): Promise<void> {
        this.autoCertifierClient.on('updatedCertificate', (subdomain: CertifiedSubdomain) => {
            this.setHost(subdomain.fqdn)
            this.updateCertificate(subdomain.certificate, subdomain.privateKey)
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
