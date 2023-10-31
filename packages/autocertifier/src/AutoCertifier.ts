import { Database } from './Database'
import { DnsServer } from './DnsServer'
import { RestInterface } from './RestInterface'
import { RestServer } from './RestServer'
import { v4 } from 'uuid'
import { CertifiedSubdomain, Session } from '@streamr/autocertifier-client'
import { Logger } from '@streamr/utils'
import { CertificateCreator } from './CertificateCreator'
import { StreamrChallenger } from './StreamrChallenger'
import 'dotenv/config'

const logger = new Logger(module)

const validateEnvironmentVariable = (name: string): string | never => {
    const value = process.env[name]
    if (!value) {
        throw new Error(`${name} environment variable is not set`)
    }
    return value
}

export class AutoCertifier implements RestInterface {

    private domainName?: string
    private dnsServer?: DnsServer
    private restServer?: RestServer
    private database?: Database
    private certificateCreator?: CertificateCreator
    private streamrChallenger = new StreamrChallenger()

    // eslint-disable-next-line class-methods-use-this
    public async createSession(): Promise<Session> {
        logger.info('creating new session')
        return { sessionId: v4() }
    }

    public async createNewSubdomainAndCertificate(
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        streamrWebSocketCaCert?: string
    ): Promise<CertifiedSubdomain> {
        logger.trace('Creating new subdomain and certificate for ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId 
        await this.streamrChallenger.testStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId, streamrWebSocketCaCert)
        
        const subdomain = v4()
        const token = v4()
        await this.dnsServer!.createSubdomain(subdomain, ipAddress, port, token)
        const cert = await this.certificateCreator!.createCertificate(subdomain + '.' + this.domainName)

        return { 
            subdomain: subdomain,
            fqdn: this.domainName!,
            token: token,
            certificate: cert
        }
    }

    public async createNewCertificateForSubdomain(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        token: string
    ): Promise<CertifiedSubdomain> {

        logger.info('creating new certificate for ' + subdomain + ' and ' + ipAddress + ':' + port)

        // This will throw if the token is incorrect
        await this.updateSubdomainIpAndPort(subdomain, ipAddress, port, streamrWebSocketPort, sessionId, token)

        const cert = await this.certificateCreator!.createCertificate(subdomain + '.' + this.domainName)

        return {
            subdomain: subdomain,
            fqdn: this.domainName!,
            token: token,
            certificate: cert
        }
    }

    public async updateSubdomainIpAndPort(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        token: string
    ): Promise<void> {

        logger.info('updating subdomain ip and port for ' + subdomain + ' to ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId 
        await this.streamrChallenger.testStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId)
        await this.dnsServer!.updateSubdomainIpAndPort(subdomain, ipAddress, port, token)
    }

    // ChallengeInterface implementation
    public async createChallenge(fqdn: string, value: string): Promise<void> {
        logger.info('creating challenge for ' + fqdn + ' with value ' + value)
        this.dnsServer!.updateSubdomainAcmeChallenge(fqdn, value)
    }

    // ChallengeInterface implementation
    // eslint-disable-next-line class-methods-use-this
    public async deleteChallenge(_name: string): Promise<void> {
        // TODO: Should this function do something?
    }

    public async start(): Promise<void> {
        this.domainName = process.env['AUTOCERTIFIER_DOMAIN_NAME']
        if (!this.domainName) {
            throw new Error('AUTOCERTIFIER_DOMAIN_NAME environment variable is not set')
        }

        // the dns server will answer to NS queries with 
        // AUTOCERTIFIER_OWN_HOSTNAME.AUTOCERTIFIER_DOMAIN_NAME 
        const ownHostName = validateEnvironmentVariable('AUTOCERTIFIER_OWN_HOSTNAME')
        const ownIpAddress = validateEnvironmentVariable('AUTOCERTIFIER_OWN_IP_ADDRESS')
        const dnsServerPort = validateEnvironmentVariable('AUTOCERTIFIER_DNS_SERVER_PORT')
        const restServerPort = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_PORT')
        const databaseFilePath = validateEnvironmentVariable('AUTOCERTIFIER_DATABASE_FILE_PATH')
        const accountPrivateKeyPath = validateEnvironmentVariable('AUTOCERTIFIER_ACCOUNT_PRIVATE_KEY_PATH')
        const acmeDirectoryUrl = validateEnvironmentVariable('AUTOCERTIFIER_ACME_DIRECTORY_URL')
        const hmacKid = validateEnvironmentVariable('AUTOCERTIFIER_HMAC_KID')
        const hmacKey = validateEnvironmentVariable('AUTOCERTIFIER_HMAC_KEY')
        const restServerCaCertPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_CA_CERT_PATH')
        const restServerCaKeyPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_CA_KEY_PATH')
        const restServerCertPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_CERT_PATH')
        const restServerKeyPath = validateEnvironmentVariable('AUTOCERTIFIER_REST_SERVER_KEY_PATH')

        this.database = new Database(databaseFilePath)
        await this.database.start()
        logger.info('database is running on file ' + databaseFilePath)

        this.dnsServer = new DnsServer(this.domainName, ownHostName, dnsServerPort,
            ownIpAddress, this.database)
        await this.dnsServer.start()
        logger.info('dns server is running for domain ' + this.domainName + ' on port ' + dnsServerPort)

        this.certificateCreator = new CertificateCreator(acmeDirectoryUrl, hmacKid, hmacKey,
            accountPrivateKeyPath, this)
        logger.info('certificate creator is running')

        this.restServer = new RestServer(ownHostName + '.' + this.domainName, ownIpAddress, restServerPort, restServerCaCertPath, restServerCaKeyPath,
            restServerCertPath, restServerKeyPath, this)
        await this.restServer.start()
        logger.info('rest server is running on port ' + restServerPort)
    }

    public async stop(): Promise<void> {
        if (this.restServer) {
            await this.restServer.stop()
        }
        if (this.dnsServer) {
            await this.dnsServer.stop()
        }
        if (this.database) {
            await this.database.stop()
        }
    }
}

