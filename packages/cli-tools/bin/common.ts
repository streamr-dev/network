import * as commander from 'commander'
import { Wallet } from 'ethers'
import { StreamrClientOptions } from 'streamr-client'

export interface EnvironmentOptions {
    dev?: boolean
    stg?: boolean
    httpUrl?: string
}

export interface AuthenticationOptions {
    privateKey?: string
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
    { dev, stg, httpUrl, privateKey }: EnvironmentOptions & AuthenticationOptions
): StreamrClientOptions {
    const options: StreamrClientOptions = {}

    if (dev && stg) {
        console.error('flags --dev and --stg cannot be enabled at the same time')
        process.exit(1)
    }

    if (dev) {
        options.restUrl = 'http://localhost/api/v1'
        options.storageNodeRegistry = {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
            jsonRpcProvider: `http://10.200.10.1:8546`
        }
    } else if (stg) {
        options.restUrl = 'https://staging.streamr.com/api/v1/'
    }

    if (httpUrl) {
        options.restUrl = httpUrl
    }

    if (privateKey) {
        options.auth = {
            privateKey
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getStreamId = (streamIdOrPath: string|undefined, options: any): string | undefined => {
    if (streamIdOrPath === undefined) {
        return undefined
    }
    const PATH_PREFIX = '/'
    if (!streamIdOrPath.startsWith(PATH_PREFIX)) {
        return streamIdOrPath
    }
    const privateKey = options.privateKey
    if (privateKey === undefined) {
        console.error(`relative stream id ${streamIdOrPath} requires authentication`)
        process.exit(1)
    }
    return new Wallet(privateKey).address.toLowerCase() + streamIdOrPath
}
