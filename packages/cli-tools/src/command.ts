import { DEFAULT_ENVIRONMENT_ID, ENVIRONMENT_IDS, EnvironmentId, StreamrClientConfig, DEFAULT_KEY_TYPE } from '@streamr/sdk'
import { KeyType, KEY_TYPES } from '@streamr/utils'
import commander, { Command } from 'commander'
import pkg from '../package.json'
import { createClient } from './client'
import { createFnParseEnum, formEnumArgValueDescription } from './common'

export interface Options {
    publicKey?: string
    privateKey?: string
    keyType?: KeyType
    config?: string
    env?: EnvironmentId
    quantum?: boolean
}

export const createCommand = (): commander.Command => {
    return new Command()
        .version(pkg.version)
        .showHelpAfterError()
        .allowExcessArguments(false)
}

export interface CommandOpts {
    autoDestroyClient?: boolean
    clientOptionsFactory?: (options: any) => StreamrClientConfig
}

export const createClientCommand = (
    action: (...handleArgs: any[]) => Promise<void>, 
    opts: CommandOpts = {
        autoDestroyClient: true,
        clientOptionsFactory: () => ({})
    }
): commander.Command => {
    return createCommand()
        .option('--private-key <key>', 'a private key to establish your identity')
        .option('--key-type [key-type]', `type of public/private key (${formEnumArgValueDescription(KEY_TYPES, DEFAULT_KEY_TYPE)})`, 
            createFnParseEnum('key-type', KEY_TYPES))
        .option('--public-key [public-key]', 'a public key - required by some key types')
        .option('--config <file>', 'read connection and identity settings from a config file')
        .option('--env <environmentId>', `use pre-defined environment (${formEnumArgValueDescription(ENVIRONMENT_IDS, DEFAULT_ENVIRONMENT_ID)})`,
            createFnParseEnum('env', ENVIRONMENT_IDS))
        .option('--quantum', 'require quantum resistant key exchange and signature algorithms to be used')
        .action(async (...args: any[]) => {
            const commandOptions = args[args.length - 1].opts()
            try {
                const client = createClient(commandOptions, opts.clientOptionsFactory!(commandOptions))
                try {
                    await action(...[client].concat(args))
                } finally {
                    if (opts.autoDestroyClient) {
                        await client.destroy()
                    }
                }
                // Exit cleanly after command completes - worker threads may keep event loop alive
                process.exit(0)
            } catch (e: any) {
                console.error(e)
                process.exit(1)
            }
        })
}
