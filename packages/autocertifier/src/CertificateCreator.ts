import { Logger } from '@streamr/utils'
import * as acme from 'acme-client'
import fs from 'fs'
import path from 'path'
import { ChallengeManager } from './ChallengeManager'
import { Certificate } from '@streamr/autocertifier-client'
import { filePathToNodeFormat } from '@streamr/utils'
import { Challenge } from 'acme-client/types/rfc8555'

const logger = new Logger(module)

export class CertificateCreator {

    private accountPrivateKey?: Buffer
    private accountPrivateKeyPath: string
    private readonly acmeDirectoryUrl: string
    private readonly hmacKid: string
    private readonly hmacKey: string
    private readonly challengeManager: ChallengeManager

    constructor(
        acmeDirectoryUrl: string,
        hmacKid: string,
        hmacKey: string,
        privateKeyPath: string,
        challengeManager: ChallengeManager
    ) {
        this.acmeDirectoryUrl = acmeDirectoryUrl
        this.hmacKid = hmacKid
        this.hmacKey = hmacKey
        this.challengeManager = challengeManager
        this.accountPrivateKeyPath = filePathToNodeFormat(privateKeyPath)
    }

    public async createCertificate(fqdn: string): Promise<Certificate> {
        logger.info(`Creating certificate for ${fqdn}`)

        const wasNewKeyCreated = await this.createPrivateKey()
        const clientOptions: acme.ClientOptions = {
            directoryUrl: this.acmeDirectoryUrl,
            accountKey: this.accountPrivateKey!
        }
        if (wasNewKeyCreated) {
            clientOptions.externalAccountBinding = {
                kid: this.hmacKid,
                hmacKey: this.hmacKey
            }
        }
        const client = new acme.Client(clientOptions)
        logger.debug('Creating CSR')
        const [key, csr] = await acme.crypto.createCsr({
            commonName: fqdn
        })
       
        logger.debug('Creating certificate using client.auto')
        let cert: string
        try {
            cert = await client.auto({
                csr,
                email: 'autocertifier@streamr.network',
                termsOfServiceAgreed: true,
                challengePriority: ['dns-01'],
                challengeCreateFn: async (authz: acme.Authorization, _challenge: Challenge, keyAuthorization: string) => {
                    await this.challengeManager.createChallenge(authz.identifier.value, keyAuthorization)
                },
                challengeRemoveFn: async (authz: acme.Authorization) => {
                    await this.challengeManager.deleteChallenge(authz.identifier.value)
                },
            })
        } catch (e) {
            logger.error('Failed to create certificate: ' + e.message)
            throw e
        }
        return { cert: cert.toString(), key: key.toString() }
    }

    // TODO: should this funcion just reject if private key is not found?
    private createPrivateKey = async (): Promise<boolean> => {
        try {
            // try to read private key from file
            this.accountPrivateKey = fs.readFileSync(this.accountPrivateKeyPath)
        } catch (err) {
            if (err.code === 'ENOENT') {
                // if not found, create new private key and save it to file
                this.accountPrivateKey = await acme.crypto.createPrivateKey()
                fs.mkdirSync(path.dirname(this.accountPrivateKeyPath), { recursive: true })
                fs.writeFileSync(this.accountPrivateKeyPath, this.accountPrivateKey, { mode: 0o600 })
            } else {
                throw err
            }
            return true
        }
        return false
    }

}
