#!/usr/bin/env node
import '../src/logLevel'
import { KeyPairIdentity } from '@streamr/sdk/dist/types/src/identity/KeyPairIdentity'
import { identityFactoryByKeyType, validKeyTypeValues } from '@streamr/sdk'
import { binaryToHex } from '@streamr/utils'
import { createCommand, Options } from '../src/command'

createCommand()
    .description('generate a public/private key pair based on the --key-type option')
    .option('--key-type [key-type]', `one of: [${validKeyTypeValues.join(', ')}]`)
    .action(async (options: Options) => {
        if (!options.keyType) {
            console.error('Error: Please provide the --key-type')
        } else {
            const identity = identityFactoryByKeyType[options.keyType].generate() as KeyPairIdentity
            console.info(`Public key: ${await identity.getUserIdString()}\n\n`)
            console.info(`Private key: ${binaryToHex(await identity.getPrivateKey())}`)
        }
    })
    .parse()
