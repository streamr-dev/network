import { Wallet } from 'ethers'

export interface GlobalCommandLineArgs {
    dev?: boolean
    config?: string
    privateKey?: string
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
export const getStreamId = (streamIdOrPath: string|undefined, options: any): string|undefined => {
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
