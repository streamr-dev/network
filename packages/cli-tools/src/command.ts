import { DEFAULT_ENVIRONMENT_ID, ENVIRONMENT_IDS, EnvironmentId, StreamrClientConfig } from '@streamr/sdk'
import commander, { Command } from 'commander'
import pkg from '../package.json'
import { createClient } from './client'
import { createFnParseEnum, formEnumArgValueDescription } from './common'

export interface Options {
    privateKey?: string
    config?: string
    env?: EnvironmentId
}

export const createCommand = (): commander.Command => {
    return new Command().version(pkg.version).showHelpAfterError().allowExcessArguments(false)
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
        .option('--private-key <key>', 'use an Ethereum private key to authenticate')
        .option('--config <file>', 'read connection and authentication settings from a config file')
        .option(
            '--env <environmentId>',
            `use pre-defined environment (${formEnumArgValueDescription(ENVIRONMENT_IDS, DEFAULT_ENVIRONMENT_ID)})`,
            createFnParseEnum('env', ENVIRONMENT_IDS)
        )
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
            } catch (e: any) {
                console.error(e)
                process.exit(1)
            }
        })
}
