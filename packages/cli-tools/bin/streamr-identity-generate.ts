#!/usr/bin/env node
import '../src/logLevel'
import { binaryToHex, KEY_TYPES, SigningUtil, toUserId } from '@streamr/utils'
import { createCommand, Options } from '../src/command'
import { formEnumArgValueDescription, createFnParseEnum } from '../src/common'

createCommand()
    .description('generate a public/private key pair based on the --key-type option')
    .requiredOption('--key-type [key-type]', `type of public/private key (${formEnumArgValueDescription(KEY_TYPES)})`, 
        createFnParseEnum('key-type', KEY_TYPES))
    .action(async (options: Options) => {
        const signingUtil = SigningUtil.getInstance(options.keyType!) // required option
        const keyPair = signingUtil.generateKeyPair()
        console.info(JSON.stringify({
            publicKey: toUserId(keyPair.publicKey),
            privateKey: binaryToHex(keyPair.privateKey),
        }, null, 4))
    })
    .parse()
