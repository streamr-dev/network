import { Logger, filePathToNodeFormat } from '@streamr/utils'
import * as acme from 'acme-client'
import fs from 'fs'
import path from 'path'
import { ChallengeManager } from './ChallengeManager'
import { Challenge } from 'acme-client/types/rfc8555'

const logger = new Logger(module)

// https://letsencrypt.org/docs/challenge-types/#dns-01-challenge
const DNS_01_CHALLENGE = 'dns-01'

interface CertificateAndKey {
    certificate: string
    privateKey: string
}

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

    public async createCertificate(fqdn: string): Promise<CertificateAndKey> {
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

        logger.debug('Creating certificate')
        let cert: string
        let keyAuth: string
        try {
            cert = await client.auto({
                csr,
                email: 'autocertifier@streamr.network',
                termsOfServiceAgreed: true,
                challengePriority: [DNS_01_CHALLENGE],
                challengeCreateFn: async (
                    authz: acme.Authorization,
                    _challenge: Challenge,
                    keyAuthorization: string
                ) => {
                    // this value must be saved for the challengeRemoveFn
                    keyAuth = keyAuthorization
                    await this.challengeManager.createChallenge(authz.identifier.value, keyAuthorization)
                },
                challengeRemoveFn: async (authz: acme.Authorization) => {
                    await this.challengeManager.deleteChallenge(authz.identifier.value, keyAuth)
                }
            })
        } catch (e) {
            logger.error('Failed to create certificate: ' + e.message)
            throw e
        }
        return { certificate: cert.toString(), privateKey: key.toString() }
    }

    // TODO: should this funcion just reject if private key is not found?
    private createPrivateKey = async (): Promise<boolean> => {
        try {
            // try to read private key from file
            // TODO: would it be bad to generate a new key every time the software is started? Is there a reason to store
            // the key and re-use it?
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
