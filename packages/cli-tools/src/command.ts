import commander, { Command } from 'commander'
import { StreamrClientConfig } from 'streamr-client'
import pkg from '../package.json'
import { createClient } from './client'

export interface Options {
    privateKey?: string
    config?: string
    dev: boolean
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
        .option('--private-key <key>', 'use an Ethereum private key to authenticate')
        .option('--config <file>', 'read connection and authentication settings from a config file')
        .option('--dev', 'use pre-defined development environment', false)
        .action(async (...args: any[]) => {
            const commandLineOptions = args[args.length - 1].opts()
            try {
                const client = createClient(commandLineOptions, opts.clientOptionsFactory!(commandLineOptions))
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
