import * as commander from 'commander'
import { StreamrClientOptions } from 'streamr-client'

export interface EnvironmentOptions {
    dev?: boolean
    stg?: boolean
    wsUrl?: string
    httpUrl?: string 
}

export interface AuthenticationOptions {
    privateKey?: string
    apiKey?: string
}

export function envOptions(program: commander.Command): commander.Command {
    return program
        .option('--dev', 'use pre-defined development environment')
        .option('--stg', 'use pre-defined staging environment')
        .option('--ws-url <url>', 'alternative websocket url to use')
        .option('--http-url <url>', 'alternative http url to use')
}

export function authOptions(program: commander.Command): commander.Command {
    return program
        .option('--private-key <key>', 'use an Ethereum private key to authenticate')
        .option('--api-key <key>', 'use an API key to authenticate (deprecated)')
}

export function exitWithHelpIfArgsNotBetween(program: commander.Command, min: number, max: number): void {
    if (program.args.length < min || program.args.length > max) {
        program.help()
    }
}

export function formStreamrOptionsWithEnv(
    { dev, stg, wsUrl, httpUrl, privateKey, apiKey }: EnvironmentOptions & AuthenticationOptions
): StreamrClientOptions {
    const options: StreamrClientOptions = {}

    if (dev && stg) {
        console.error('flags --dev and --stg cannot be enabled at the same time')
        process.exit(1)
    }

    if (dev) {
        options.url = 'ws://localhost/api/v1/ws'
        options.restUrl = 'http://localhost/api/v1'
        options.storageNode = {
            // "broker-node-storage-1" on Docker environment
            address: '0xde1112f631486CfC759A50196853011528bC5FA0',
            url: 'http://10.200.10.1:8891'
        }
    } else if (stg) {
        options.url = 'wss://staging.streamr.com/api/v1/ws'
        options.restUrl = 'https://staging.streamr.com/api/v1/'
    }

    if (wsUrl) {
        options.url = wsUrl
    }
    if (httpUrl) {
        options.restUrl = httpUrl
    }

    if (privateKey && apiKey) {
        console.error('flags --privateKey and --apiKey cannot be used at the same time')
        process.exit(1)
    }

    if (privateKey) {
        options.auth = {
            privateKey
        }
    } else if (apiKey) {
        options.auth = {
            apiKey
        }
    }

    return options
}

export function createFnParseInt(name: string): (s: string) => number {
    return (str: string) => {
        const n = parseInt(str, 10)
        if (isNaN(n)) {
            console.error(`${name} must be an integer (was "${str}")`)
            process.exit(1)
        }
        return n
    }
}