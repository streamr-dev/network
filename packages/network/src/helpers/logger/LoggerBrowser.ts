import pino from 'pino'

import { LoggerCommon } from './LoggerCommon'

export class LoggerBrowser extends LoggerCommon {
    static NAME_LENGTH = 20

    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const options: pino.LoggerOptions = {
            name: LoggerBrowser.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info'
        }
        super(options, destinationStream)
    }
}

export { LoggerBrowser as Logger }
