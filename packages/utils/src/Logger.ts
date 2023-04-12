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

const NOLOG = process.env.NOLOG
const LOG_LEVEL = process.env.LOG_LEVEL
const DISABLE_PRETTY_LOG = process.env.DISABLE_PRETTY_LOG
const LOG_COLORS = process.env.LOG_COLORS
const STREAMR_APPLICATION_ID = process.env.STREAMR_APPLICATION_ID

const rootLogger = pino({
    name: 'rootLogger',
    enabled: !NOLOG,
    level: LOG_LEVEL ?? 'info',
    formatters: {
        level: (label) => {
            return { level: label } // log level as string instead of number
        }
    },
    transport: (typeof window === 'object' || DISABLE_PRETTY_LOG) ? undefined : {
        target: 'pino-pretty',
        options: {
            colorize: parseBoolean(LOG_COLORS) ?? true,
            translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
            ignore: 'pid,hostname',
            levelFirst: true,
        }
    }
})

export class Logger {
    static NAME_LENGTH = 20

    static createName(module: NodeJS.Module, context?: string): string {
        const parsedPath = path.parse(String(module.id))
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const longName = without([STREAMR_APPLICATION_ID, context, fileId], undefined).join(':')
        return DISABLE_PRETTY_LOG ? longName : padEnd(longName.substring(0, this.NAME_LENGTH), this.NAME_LENGTH, ' ')
    }

    private readonly logger: pino.Logger

    constructor(
        module: NodeJS.Module,
        context?: string,
        defaultLogLevel: LogLevel = 'info'
    ) {
        this.logger = rootLogger.child({
            name: Logger.createName(module, context),
            level: LOG_LEVEL ?? defaultLogLevel
        })
    }

    fatal(msg: string, ...args: any[]): void {
        this.logger.fatal(msg, ...args)
    }

    error(msg: string, ...args: any[]): void {
        const errorInstance = args.find((arg) => (arg.constructor.name === 'Error'
            || arg.constructor.name === 'AggregateError'
            || arg.constructor.name === 'EvalError'
            || arg.constructor.name === 'RangeError'
            || arg.constructor.name === 'ReferenceError'
            || arg.constructor.name === 'SyntaxError'
            || arg.constructor.name === 'TypeError'
            || arg.constructor.name === 'URIError'
        ))
        if (errorInstance !== undefined) {
            this.logger.error({ err: errorInstance }, msg, ...args)
        } else {
            this.logger.error(msg, ...args)
        }
    }

    warn(msg: string, ...args: any[]): void {
        this.logger.warn(msg, ...args)
    }

    info(msg: string, ...args: any[]): void {
        this.logger.info(msg, ...args)
    }

    debug(msg: string, ...args: any[]): void {
        this.logger.debug(msg, ...args)
    }

    trace(msg: string, ...args: any[]): void {
        this.logger.trace(msg, ...args)
    }
}
