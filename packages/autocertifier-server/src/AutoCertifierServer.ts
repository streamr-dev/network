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
import { RRType } from '@aws-sdk/client-route-53'
import { Route53Api } from './Route53Api'

const logger = new Logger(module)

export const validateEnvironmentVariable = (name: string): string | never => {
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
    private route53Api?: Route53Api

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
        const useRoute53 = validateEnvironmentVariable('AUTOCERTIFIER_USE_ROUTE53') === 'true'

        if (useRoute53) {
            // these env variables are needed by route53 package, it will read the env variables internally
            validateEnvironmentVariable('AWS_ACCESS_KEY_ID')
            validateEnvironmentVariable('AWS_SECRET_ACCESS_KEY')
            this.route53Api = new Route53Api(
                validateEnvironmentVariable('AUTOCERTIFIER_ROUTE53_REGION'),
                validateEnvironmentVariable('AUTOCERTIFIER_ROUTE53_HOSTED_ZONE_ID')
            )
        }

        this.database = new Database(databaseFilePath)
        await this.database.start()
        logger.info('database is running on file ' + databaseFilePath)

        this.dnsServer = new DnsServer(this.domainName, ownHostName, dnsServerPort, ownIpAddress, this.database)
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

        this.restServer = new RestServer(ownIpAddress, restServerPort, restServerCertPath, restServerKeyPath, this)
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
        sessionId: string
    ): Promise<CertifiedSubdomain> {
        logger.trace('Creating new subdomain and certificate for ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId
        await runStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId)

        const subdomain = v4()
        const authenticationToken = v4()
        await this.database!.createSubdomain(subdomain, ipAddress, port, authenticationToken)
        const fqdn = subdomain + '.' + this.domainName

        if (this.route53Api !== undefined) {
            await this.route53Api.upsertRecord(RRType.A, fqdn, ipAddress, 300)
        }

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
        authenticationToken: string
    ): Promise<CertifiedSubdomain> {
        logger.info('creating new certificate for ' + subdomain + ' and ' + ipAddress + ':' + port)

        // This will throw if the authenticationToken is incorrect
        await this.updateSubdomainIp(subdomain, ipAddress, port, streamrWebSocketPort, sessionId, authenticationToken)
        const fqdn = subdomain + '.' + this.domainName

        if (this.route53Api !== undefined) {
            await this.route53Api.upsertRecord(RRType.A, fqdn, ipAddress, 300)
        }

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
        authenticationToken: string
    ): Promise<void> {
        logger.info('updating subdomain ip and port for ' + subdomain + ' to ' + ipAddress + ':' + port)

        // this will throw if the client cannot answer the challenge of getting sessionId
        await runStreamrChallenge(ipAddress, streamrWebSocketPort, sessionId)
        await this.database!.updateSubdomainIp(subdomain, ipAddress, port, authenticationToken)
        const fqdn = subdomain + '.' + this.domainName

        if (this.route53Api !== undefined) {
            await this.route53Api.upsertRecord(RRType.A, fqdn, ipAddress, 300)
        }
    }

    // ChallengeManager implementation
    public async createChallenge(fqdn: string, value: string): Promise<void> {
        logger.info('creating challenge for ' + fqdn + ' with value ' + value)
        await this.database!.updateSubdomainAcmeChallenge(fqdn.split('.')[0], value)
        if (this.route53Api !== undefined) {
            logger.trace(`Creating acme challenge for ${fqdn} with value ${value} to Route53`)
            await this.route53Api.upsertRecord(RRType.TXT, '_acme-challenge' + '.' + fqdn, `"${value}"`, 300)
        }
    }

    // ChallengeManager implementation
    public async deleteChallenge(fqdn: string, value: string): Promise<void> {
        if (this.route53Api !== undefined) {
            logger.trace(`Deleting acme challenge for ${fqdn} with value ${value} to Route53`)
            await this.route53Api.deleteRecord(RRType.TXT, '_acme-challenge' + '.' + fqdn, `"${value}"`, 300)
        }
    }

    public async stop(): Promise<void> {
        await this.restServer!.stop()
        await this.dnsServer!.stop()
        await this.database!.stop()
    }
}
