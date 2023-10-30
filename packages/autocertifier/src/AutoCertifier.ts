/* eslint-disable class-methods-use-this */

import { Database } from './Database'
import { DnsServer } from './DnsServer'
import { RestInterface } from './RestInterface'
import { RestServer } from './RestServer'
import { v4 } from 'uuid'
import { CertifiedSubdomain, Session } from '@streamr/autocertifier-client'
import { Logger } from '@streamr/utils'
import { CertificateCreator } from './CertificateCreator'
import { StreamrChallenger } from './StreamrChallenger'

const logger = new Logger(module)

export class AutoCertifier implements RestInterface {

    private domainName?: string
    private dnsServer?: DnsServer
    private restServer?: RestServer
    private database?: Database
    private certificateCreator?: CertificateCreator
    private streamrChallenger = new StreamrChallenger()

    // RestInterface implementation
    public async createSession(): Promise<Session> {
        logger.info('creating new session')
        const sessionId = v4()
        return { sessionId: sessionId }
    }

    public async createNewSubdomainAndCertificate(ipAddress: string, port: string,
        streamrWebSocketPort: string, sessionId: string, streamrWebSocketCaCert?: string): Promise<CertifiedSubdomain> {
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

    public async createNewCertificateForSubdomain(subdomain: string, ipAddress: string,
        port: string, streamrWebSocketPort: string, sessionId: string, token: string): Promise<CertifiedSubdomain> {

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

    public async updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string,
        streamrWebSocketPort: string, sessionId: string, token: string): Promise<void> {

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
    public async deleteChallenge(_name: string): Promise<void> {
        // Should this function do something?
    }

    public async start(): Promise<void> {
        // TODO: load env variables from .env file
        this.domainName = process.env['AUTOICERTIFIER_DOMAIN_NAME']
        if (!this.domainName) {
            throw new Error('AUTOICERTIFIER_DOMAIN_NAME environment variable is not set')
        }

        // the dns server will answer to NS queries with 
        // AUTOICERTIFIER_OWN_HOSTNAME.AUTOICERTIFIER_DOMAIN_NAME 

        const ownHostName = process.env['AUTOICERTIFIER_OWN_HOSTNAME']
        if (!ownHostName) {
            throw new Error('AUTOICERTIFIER_OWN_HOSTNAME environment variable is not set')
        }

        const ownIpAddress = process.env['AUTOICERTIFIER_OWN_IP_ADDRESS']
        if (!ownIpAddress) {
            throw new Error('AUTOICERTIFIER_OWN_IP_ADDRESS environment variable is not set')
        }

        const dnsServerPort = process.env['AUTOICERTIFIER_DNS_SERVER_PORT']
        if (!dnsServerPort) {
            throw new Error('AUTOICERTIFIER_DNS_SERVER_PORT environment variable is not set')
        }

        const restServerPort = process.env['AUTOICERTIFIER_REST_SERVER_PORT']
        if (!restServerPort) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_PORT environment variable is not set')
        }

        const databaseFilePath = process.env['AUTOICERTIFIER_DATABASE_FILE_PATH']
        if (!databaseFilePath) {
            throw new Error('AUTOICERTIFIER_DATABASE_FILE_PATH environment variable is not set')
        }

        const accountPrivateKeyPath = process.env['AUTOICERTIFIER_ACCOUNT_PRIVATE_KEY_PATH']
        if (!accountPrivateKeyPath) {
            throw new Error('AUTOICERTIFIER_ACCOUNT_PRIVATE_KEY_PATH environment variable is not set')
        }

        const acmeDirectoryUrl = process.env['AUTOCERTIFIER_ACME_DIRECTORY_URL']
        if (!acmeDirectoryUrl) {
            throw new Error('AUTOCERTIFIER_ACME_DIRECTORY_URL environment variable is not set')
        }

        const hmacKid = process.env['AUTOICERTIFIER_HMAC_KID']
        if (!hmacKid) {
            throw new Error('AUTOICERTIFIER_HMAC_KID environment variable is not set')
        }

        const hmacKey = process.env['AUTOICERTIFIER_HMAC_KEY']
        if (!hmacKey) {
            throw new Error('AUTOICERTIFIER_HMAC_KEY environment variable is not set')
        }

        const restServerCaCertPath = process.env['AUTOICERTIFIER_REST_SERVER_CA_CERT_PATH']
        if (!restServerCaCertPath) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_CA__CERT_PATH environment variable is not set')
        }

        const restServerCaKeyPath = process.env['AUTOICERTIFIER_REST_SERVER_CA_KEY_PATH']
        if (!restServerCaKeyPath) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_CA_KEY_PATH environment variable is not set')
        }

        const restServerCertPath = process.env['AUTOICERTIFIER_REST_SERVER_CERT_PATH']
        if (!restServerCertPath) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_CERT_PATH environment variable is not set')
        }

        const restServerKeyPath = process.env['AUTOICERTIFIER_REST_SERVER_KEY_PATH']
        if (!restServerKeyPath) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_KEY_PATH environment variable is not set')
        }

        this.database = new Database(databaseFilePath)
        await this.database.start()
        logger.info('database is running on file ' + databaseFilePath)

        this.dnsServer = new DnsServer(this.domainName, ownHostName, dnsServerPort,
            ownIpAddress, this.database)
        await this.dnsServer.start()
        logger.info('dns server is running for domain ' + this.domainName + ' on port ' + dnsServerPort)

        this.certificateCreator = new CertificateCreator(acmeDirectoryUrl, hmacKid, hmacKey,
            accountPrivateKeyPath, this)
        await this.certificateCreator.start()
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

