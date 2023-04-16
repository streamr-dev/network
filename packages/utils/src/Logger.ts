import pino from 'pino'
import path from 'path'
import without from 'lodash/without'
import padEnd from 'lodash/padEnd'

export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

const parseBoolean = (value: string | undefined) => {
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

declare let window: any

const rootLogger = pino({
    name: 'rootLogger',
    enabled: !process.env.NOLOG,
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
        level: (label) => {
            return { level: label } // log level as string instead of number
        }
    },
    transport: (typeof window === 'object' || process.env.DISABLE_PRETTY_LOG) ? undefined : {
        target: 'pino-pretty',
        options: {
            colorize: parseBoolean(process.env.LOG_COLORS) ?? true,
            singleLine: true,
            translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
            ignore: 'pid,hostname',
            levelFirst: true,
        }
    }
})

interface LogMethod {
    (obj: unknown, msg?: string, ...args: any[]): void
    (msg: string, ...args: any[]): void
}

export class Logger {
    static NAME_LENGTH = 20

    fatal: LogMethod
    error: LogMethod
    warn: LogMethod
    info: LogMethod
    debug: LogMethod
    trace: LogMethod

    static createName(module: NodeJS.Module, context?: string): string {
        const parsedPath = path.parse(String(module.id))
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const longName = without([process.env.STREAMR_APPLICATION_ID, context, fileId], undefined).join(':')
        return process.env.DISABLE_PRETTY_LOG ?
            longName : padEnd(longName.substring(0, this.NAME_LENGTH), this.NAME_LENGTH, ' ')
    }

    private readonly logger: pino.Logger

    constructor(
        module: NodeJS.Module,
        context?: string,
        defaultLogLevel: LogLevel = 'info',
        parentLogger: pino.Logger = rootLogger
    ) {
        this.logger = parentLogger.child({
            name: Logger.createName(module, context)
        }, {
            level: process.env.LOG_LEVEL as (string | undefined) ?? defaultLogLevel
        })
        this.fatal = this.logger.fatal.bind(this.logger)
        this.error = this.logger.error.bind(this.logger)
        this.warn = this.logger.warn.bind(this.logger)
        this.info = this.logger.info.bind(this.logger)
        this.debug = this.logger.debug.bind(this.logger)
        this.trace = this.logger.trace.bind(this.logger)
    }
}
