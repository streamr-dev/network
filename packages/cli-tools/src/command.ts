import commander, { Command } from 'commander'
import { BrubeckClientConfig } from 'streamr-client'
import pkg from '../package.json'
import { createClient } from './client'

export const createCommand = (): commander.Command => {
    return new Command()
        .version(pkg.version)
        .showHelpAfterError()
        .allowExcessArguments(false)
}

export const createClientCommand = (
    action: (...handleArgs: any[]) => Promise<void>, 
    clientOptionsFactory: (options: any) => BrubeckClientConfig = () => ({})
): commander.Command => {
    return createCommand()
        .option('--private-key <key>', 'use an Ethereum private key to authenticate')
        .option('--dev', 'use pre-defined development environment')
        .option('--stg', 'use pre-defined staging environment')
        .option('--ws-url <url>', 'alternative websocket url to use')
        .option('--http-url <url>', 'alternative http url to use')
        .action(async (...args: any[]) => {
            const commandLineOptions = args[args.length - 1].opts()
            try {
                const client = createClient(commandLineOptions, clientOptionsFactory(commandLineOptions))
                try {
                    await action(...[client].concat(args))
                } finally {
                    await client.destroy()
                }
            } catch (e: any) {
                console.error(e)
                process.exit(1)
            }
        })
}