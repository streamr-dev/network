import commander, { Command } from 'commander'
import pkg from '../package.json'

export const createCommand = (globalOptions = true): commander.Command => {
    const command = new Command()
        .version(pkg.version)
        .showHelpAfterError()
        .allowExcessArguments(false)

    if (globalOptions) {
        command
            .option('--private-key <key>', 'use an Ethereum private key to authenticate')
            .option('--dev', 'use pre-defined development environment')
            .option('--stg', 'use pre-defined staging environment')
            .option('--ws-url <url>', 'alternative websocket url to use')
            .option('--http-url <url>', 'alternative http url to use')
    }

    return command
}