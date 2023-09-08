/* eslint-disable @typescript-eslint/parameter-properties */
import { Logger } from '@streamr/utils'
import * as acme from 'acme-client'
import fs from 'fs'
import path from 'path'
import { ChallengeInterface } from './ChallengeInterface'
import { Certificate } from './data/Certificate'

const logger = new Logger(module)

export class CertificateCreator {

    accountPrivateKey?: Buffer

    constructor(private acmeDirectoryUrl: string, 
        private hmacKid: string, 
        private hmacKey: string,
        private accountPrivateKeyPath: string, 
        private challengeInterface: ChallengeInterface) {
    }

    public async createCertificate(fqdn: string): Promise<Certificate> {

        const client = new acme.Client({
            directoryUrl: this.acmeDirectoryUrl,
            accountKey: this.accountPrivateKey!,
            externalAccountBinding: {
                kid: this.hmacKid,
                hmacKey: this.hmacKey
            }
        })

        const [key, csr] = await acme.crypto.createCsr({
            commonName: fqdn
        })

        const cert = await client.auto({
            csr,
            email: 'autocertifier@streamr.network',
            termsOfServiceAgreed: true,
            challengePriority: ['dns-01'],
            challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
                await this.challengeInterface.createChallenge(authz.identifier.value, 
                    keyAuthorization)
            }, 
            challengeRemoveFn: async (authz, _challenge, _keyAuthorization) => {
                await this.challengeInterface.deleteChallenge(authz.identifier.value)
            },
        })
    
        logger.info(`CSR:\n${csr.toString()}`)
        logger.info(`Private key:\n${key.toString()}`)
        logger.info(`Certificate:\n${cert.toString()}`)

        return { cert: cert.toString(), key: key.toString() }
    }

    public async start(): Promise<void> {
        // try to read private key from file
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
        }
    }
}
