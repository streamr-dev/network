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

/**
 * Disabled when in browser or when environment variable DISABLE_PRETTY_LOG is set to true.
 */
function isPrettyPrintDisabled(): boolean {
    return typeof window === 'object' || (parseBoolean(process.env.DISABLE_PRETTY_LOG) ?? false)
}

const rootLogger = pino({
    name: 'rootLogger',
    enabled: !process.env.NOLOG,
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
        level: (label) => {
            return { level: label } // log level as string instead of number
        }
    },
    transport: isPrettyPrintDisabled() ? undefined : {
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

export class Logger {
    static NAME_LENGTH = 20

    static createName(module: NodeJS.Module): string {
        const parsedPath = path.parse(String(module.id))
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const longName = without([process.env.STREAMR_APPLICATION_ID, fileId], undefined).join(':')
        return isPrettyPrintDisabled() ?
            longName : padEnd(longName.substring(0, this.NAME_LENGTH), this.NAME_LENGTH, ' ')
    }

    private readonly logger: pino.Logger

    constructor(
        module: NodeJS.Module,
        contextBindings?: Record<string, unknown>,
        defaultLogLevel: LogLevel = 'info',
        parentLogger: pino.Logger = rootLogger
    ) {
        this.logger = parentLogger.child({
            name: Logger.createName(module),
            ...contextBindings
        }, {
            level: process.env.LOG_LEVEL as (string | undefined) ?? defaultLogLevel
        })
    }

    fatal(obj: unknown, msg?: string): void {
        this.logger.fatal(obj, msg)
    }

    error(obj: unknown, msg?: string): void {
        this.logger.error(obj, msg)
    }

    warn(obj: unknown, msg?: string): void {
        this.logger.warn(obj, msg)
    }

    info(obj: unknown, msg?: string): void {
        this.logger.info(obj, msg)
    }

    debug(obj: unknown, msg?: string): void {
        this.logger.debug(obj, msg)
    }

    trace(obj: unknown, msg?: string): void {
        this.logger.trace(obj, msg)
    }
}
