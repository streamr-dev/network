#!/usr/bin/env node
import '../src/logLevel'
import { KeyPairIdentity } from '@streamr/sdk/dist/types/src/identity/KeyPairIdentity'
import { IdentityMapping, validKeyTypeValues } from '@streamr/sdk'
import { binaryToHex } from '@streamr/utils'
import { createCommand, Options } from '../src/command'
import { formEnumArgValueDescription, createFnParseEnum } from '../src/common'

createCommand()
    .description('generate a public/private key pair based on the --key-type option')
    .requiredOption('--key-type [key-type]', `type of public/private key (${formEnumArgValueDescription(validKeyTypeValues)})`, 
        createFnParseEnum('key-type', validKeyTypeValues))
    .action(async (options: Options) => {
        const config = IdentityMapping[options.keyType!] // required option
        const identity = config.generate() as KeyPairIdentity
        console.info(JSON.stringify({ 
            publicKey: await identity.getUserId(), 
            privateKey: binaryToHex(await identity.getPrivateKey()),
        }, null, 4))
    })
    .parse()
