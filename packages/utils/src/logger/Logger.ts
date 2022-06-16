import pino from 'pino'
import pinoPretty from 'pino-pretty'

import { LoggerCommon } from './LoggerCommon'

const parseBoolean = (value: string|undefined) => {
    switch (value) {
        case 'true':
            return true
        case 'false':
            return false
        case undefined:
            return undefined
        default:
            throw new Error('Invalid boolean value: ${value}')
    }
}

const isBrowser = (): boolean => {
    // @ts-expect-error TS2304 not available in node.js
    return typeof window === 'undefined'
}

export class Logger extends LoggerCommon {
    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const options: pino.LoggerOptions = {
            name: Logger.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            prettifier: !isBrowser() && process.env.NODE_ENV === 'production' ? undefined : pinoPretty,
            prettyPrint: !isBrowser() && process.env.NODE_ENV === 'production' ? false : {
                colorize: parseBoolean(process.env.LOG_COLORS) ?? true,
                translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
                ignore: 'pid,hostname',
                levelFirst: true,
            }
        }
        super(options, destinationStream)
    }
}
