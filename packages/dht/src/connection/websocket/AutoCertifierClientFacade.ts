import {
    type CertifiedSubdomain,
    SERVICE_ID as AUTO_CERTIFIER_SERVICE_ID,
} from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Logger, waitForEvent } from '@streamr/utils'
import { ITransport } from '../../transport/ITransport' 
import { defaultAutoCertifierClientFactory } from '@/defaultAutoCertifierClientFactory'

const START_TIMEOUT = 60 * 1000

export interface IAutoCertifierClient {
    start(): Promise<void>
    stop(): void
    on(eventName: string, cb: (subdomain: CertifiedSubdomain) => void): void
    off(eventName: string, cb: (subdomain: CertifiedSubdomain) => void): void
}

interface AutoCertifierClientFacadeOptions {
    url: string
    configFile: string
    transport: ITransport
    wsServerPort: number
    // TODO: setHost and updateCertificate could be passed in a single onCertificateUpdated function.
    setHost: (host: string) => void
    updateCertificate: (certificate: string, privateKey: string) => void
    // TOD: could just pass the client?
    createClientFactory?: () => IAutoCertifierClient
}

const logger = new Logger('AutoCertifierClientFacade')

export class AutoCertifierClientFacade {

    private autoCertifierClient: IAutoCertifierClient
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly options: AutoCertifierClientFacadeOptions

    constructor(options: AutoCertifierClientFacadeOptions) {
        this.options = options
        this.rpcCommunicator = new ListeningRpcCommunicator(AUTO_CERTIFIER_SERVICE_ID, options.transport)
        this.autoCertifierClient = options.createClientFactory ? options.createClientFactory() 
            : defaultAutoCertifierClientFactory(
                options.configFile,
                options.url,
                this.rpcCommunicator,
                options.wsServerPort
            )
    }

    async start(): Promise<void> {
        this.autoCertifierClient.on('updatedCertificate', (subdomain: CertifiedSubdomain) => {
            this.options.setHost(subdomain.fqdn)
            this.options.updateCertificate(subdomain.certificate, subdomain.privateKey)
            logger.trace(`Updated certificate`)
        })
        await Promise.all([
            waitForEvent(this.autoCertifierClient, 'updatedCertificate', START_TIMEOUT),
            this.autoCertifierClient.start()
        ])
    }

    stop(): void {
        this.autoCertifierClient.stop()
        this.rpcCommunicator.destroy()
    }

}
