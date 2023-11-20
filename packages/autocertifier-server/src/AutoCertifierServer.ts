import { Database } from './Database'
import { DnsServer } from './DnsServer'
import { RestInterface } from './RestInterface'
import { RestServer } from './RestServer'
import { v4 } from 'uuid'
import { CertifiedSubdomain, Session } from '@streamr/autocertifier-client'
import { Logger } from '@streamr/utils'
import { CertificateCreator } from './CertificateCreator'
import { runStreamrChallenge } from './StreamrChallenger'
import 'dotenv/config'
import { ChallengeManager } from './ChallengeManager'

const logger = new Logger(module)

const validateEnvironmentVariable = (name: string): string | never => {
    const value = process.env[name]
    if (value === undefined) {
        throw new Error(`${name} environment variable is not set`)
    }
    return value
}

export class AutoCertifierServer implements RestInterface, ChallengeManager {

    private domainName?: string
    private dnsServer?: DnsServer
    private restServer?: RestServer
    private database?: Database
    private certificateCreator?: CertificateCreator

    public async start(): Promise<void> {
        // TODO: considering env name prefix AUTO_CERTIFIER for consistent naming
        this.domainName = validateEnvironmentVariable('AUTOCERTIFIER_DOMAIN_NAME')
        // the dns server will answer to NS queries with
        // AUTOCERTIFIER_OWN_HOSTNAME.AUTOCERTIFIER_DOMAIN_NAME
        const ownHostName = validateEnvironmentVariable('AUTOCERTIFIER_OWN_HOSTNAME')
        const ownIpAddress = validateEnvironmentVariable('AUTOCERTIFIER_OWN_IP_ADDRESS')
        // TODO: validate that parseInt actually integers
        const dnsServerPort = parseInt(validateEnvironmentVariable('AUTOCERTIFIER_DNS_SERVER_PORT'))
        const restServerPort = parseInt(validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_PORT'))
        const databaseFilePath = validateEnvironmentVariable('AUTOCERTIFIER_DATABASE_FILE_PATH')
        const accountPrivateKeyPath = validateEnvironmentVariable('AUTOCERTIFIER_ACCOUNT_PRIVATE_KEY_PATH')
        const acmeDirectoryUrl = validateEnvironmentVariable('AUTOCERTIFIER_ACME_DIRECTORY_URL')
        const hmacKid = validateEnvironmentVariable('AUTOCERTIFIER_HMAC_KID')
        const hmacKey = validateEnvironmentVariable('AUTOCERTIFIER_HMAC_KEY')
        const restServerCertPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_CERT_PATH')
        const restServerKeyPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_KEY_PATH')

        this.database = new Database(databaseFilePath)
        await this.database.start()
        logger.info('database is running on file ' + databaseFilePath)

        this.dnsServer = new DnsServer(
            this.domainName,
            ownHostName,
            dnsServerPort,
            ownIpAddress,
            this.database
        )
        await this.dnsServer.start()
        logger.info('dns server is running for domain ' + this.domainName + ' on port ' + dnsServerPort)

        this.certificateCreator = new CertificateCreator(
            acmeDirectoryUrl,
            hmacKid,
            hmacKey,
            accountPrivateKeyPath,
            this
        )
        logger.info('certificate creator is running')

        this.restServer = new RestServer(
            ownIpAddress,
            restServerPort,
            restServerCertPath,
            restServerKeyPath,
            this
        )
        await this.restServer.start()
    }

    // eslint-disable-next-line class-methods-use-this
    public async createSession(): Promise<Session> {
        logger.info('creating new session')
        return { id: v4() }
    }

    public async createNewSubdomainAndCertificate(
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        nodeId: string
    ): Promise<CertifiedSubdomain> {
        logger.trace('Creating new subdomain and certificate for ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId 
        await runStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId, nodeId)
        
        const subdomain = v4()
        const authenticationToken = v4()
        await this.database!.createSubdomain(subdomain, ipAddress, port, authenticationToken)
        const fqdn = subdomain + '.' + this.domainName
        const certificate = await this.certificateCreator!.createCertificate(fqdn)
        return {
            fqdn,
            authenticationToken,
            certificate: certificate.certificate,
            privateKey: certificate.privateKey
        }
    }

    public async createNewCertificateForSubdomain(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        authenticationToken: string,
        nodeId: string
    ): Promise<CertifiedSubdomain> {

        logger.info('creating new certificate for ' + subdomain + ' and ' + ipAddress + ':' + port)

        // This will throw if the authenticationToken is incorrect
        await this.updateSubdomainIp(subdomain, ipAddress, port, streamrWebSocketPort, sessionId, authenticationToken, nodeId)
        const fqdn = subdomain + '.' + this.domainName
        const certificate = await this.certificateCreator!.createCertificate(fqdn)
        return {
            fqdn,
            authenticationToken,
            certificate: certificate.certificate,
            privateKey: certificate.privateKey
        }
    }

    public async updateSubdomainIp(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        authenticationToken: string,
        nodeId: string
    ): Promise<void> {

        logger.info('updating subdomain ip and port for ' + subdomain + ' to ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId
        // or the nodeId of the 
        await runStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId, nodeId)
        await this.database!.updateSubdomainIp(subdomain, ipAddress, port, authenticationToken)
    }

    // ChallengeManager implementation
    public async createChallenge(fqdn: string, value: string): Promise<void> {
        logger.info('creating challenge for ' + fqdn + ' with value ' + value)
        await this.database!.updateSubdomainAcmeChallenge(fqdn.split('.')[0], value)
    }

    // ChallengeManager implementation
    // eslint-disable-next-line class-methods-use-this
    public async deleteChallenge(): Promise<void> {
        // TODO: Should this function do something?
        // TODO: we could add logging here to see if this is actually called ever
    }

    public async stop(): Promise<void> {
        await this.restServer!.stop()
        await this.dnsServer!.stop()
        await this.database!.stop()
    }
}
