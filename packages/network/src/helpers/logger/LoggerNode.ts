import pino from 'pino'

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

export class LoggerNode extends LoggerCommon {
    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const transport = process.env.NODE_ENV === 'production' ? undefined : {
            target: 'pino-pretty',
            options: {
                colorize: parseBoolean(process.env.LOG_COLORS) ?? true,
                translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
                ignore: 'pid,hostname',
                levelFirst: true,
            }
        }
        const options: pino.LoggerOptions = {
            name: LoggerNode.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            transport
        }
        super(options, destinationStream)
    }
}

export { LoggerNode as Logger }
