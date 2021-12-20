import pino from 'pino'

import { LoggerCommon } from './LoggerCommon'

export class LoggerBrowser extends LoggerCommon {
    static NAME_LENGTH = 20

    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const options: pino.LoggerOptions = {
            name: LoggerBrowser.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            // explicitly pass prettifier, otherwise pino may try to lazy require it,
            // which can fail when under jest+typescript, due to some CJS/ESM
            // incompatibility leading to throwing an error like:
            // "prettyFactory is not a function"
            prettifier: undefined,
            prettyPrint: false,
        }
        super(options, destinationStream)
    }
}

export { LoggerBrowser as Logger }
