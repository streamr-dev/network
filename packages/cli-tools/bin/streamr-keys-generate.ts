#!/usr/bin/env node
import '../src/logLevel'
import { KeyPairIdentity } from '@streamr/sdk/dist/types/src/identity/KeyPairIdentity'
import { identityConfig, validKeyTypeValues } from '@streamr/sdk'
import { binaryToHex } from '@streamr/utils'
import { createCommand, Options } from '../src/command'

createCommand()
    .description('generate a public/private key pair based on the --key-type option')
    .option('--key-type [key-type]', `one of: [${validKeyTypeValues.join(', ')}]`)
    .action(async (options: Options) => {
        if (!options.keyType) {
            console.error(`Error: Please provide --key-type [one of: ${validKeyTypeValues.join(', ')}]`)
        } else {
            const config = identityConfig[options.keyType]
            if (!config) {
                console.error(`Error: Invalid key type. Must be one of: ${validKeyTypeValues.join(', ')}.`)
            }
            const identity = await config.generate() as KeyPairIdentity
            console.info(`Public key: ${await identity.getUserIdString()}`)
            console.info(`---`)
            console.info(`Private key: ${binaryToHex(await identity.getPrivateKey())}`)
        }
    })
    .parse()
