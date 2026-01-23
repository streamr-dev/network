import pino from 'pino'
import path from 'path'
import without from 'lodash/without'
import padEnd from 'lodash/padEnd'
import { env } from '@/env'

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

/**
 * Disabled when environment variable DISABLE_PRETTY_LOG is set to true.
 */
function isPrettyPrintDisabled(): boolean {
    return parseBoolean(env.DISABLE_PRETTY_LOG) ?? false
}

function isJestRunning(): boolean {
    return env.JEST_WORKER_ID !== undefined
}

/**
 * This whole monstrosity exists only because pino in browser environment will not print a log message
 * when invoking `logger.info(undefined, 'msg') instead you need to call `logger.info(msg)`.
 */
function wrappedMethodCall(
    wrappedPinoMethod: pino.LogFn,
): (msg: string, metadata?: Record<string, unknown>) => void {
    return (msg, metadata) => {
        if (metadata !== undefined) {
            wrappedPinoMethod(metadata, msg)
        } else {
            wrappedPinoMethod(msg)
        }
    }
}

export type LoggerModule = string | { id: string }

export class Logger {
    static NAME_LENGTH = 25

    private static rootLogger: pino.Logger | undefined

    private static getRootLogger(): pino.Logger {
        Logger.rootLogger ??= pino({
            name: 'rootLogger',
            enabled: !env.NOLOG,
            level: env.LOG_LEVEL ?? 'info',
            formatters: {
                level: (label) => {
                    return { level: label } // log level as string instead of number
                },
            },
            transport: isPrettyPrintDisabled()
                ? undefined
                : {
                    target: 'pino-pretty',
                    options: {
                        colorize: parseBoolean(env.LOG_COLORS) ?? true,
                        singleLine: true,
                        translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
                        ignore: 'pid,hostname',
                        levelFirst: true,
                        sync: isJestRunning(),
                    },
                },
            browser: {
                asObject: true,
            },
        })

        return Logger.rootLogger
    }

    private readonly logger: pino.Logger
    fatal: (msg: string, metadata?: Record<string, unknown>) => void
    error: (msg: string, metadata?: Record<string, unknown>) => void
    warn: (msg: string, metadata?: Record<string, unknown>) => void
    info: (msg: string, metadata?: Record<string, unknown>) => void
    debug: (msg: string, metadata?: Record<string, unknown>) => void
    trace: (msg: string, metadata?: Record<string, unknown>) => void

    constructor(
        loggerModule: LoggerModule,
        contextBindings?: Record<string, unknown>,
        defaultLogLevel: LogLevel = 'info',
        parentLogger: pino.Logger = Logger.getRootLogger()
    ) {
        this.logger = parentLogger.child({
            name: Logger.createName(loggerModule),
            ...contextBindings
        }, {
            level: env.LOG_LEVEL ?? defaultLogLevel
        })
        this.fatal = wrappedMethodCall(this.logger.fatal.bind(this.logger))
        this.error = wrappedMethodCall(this.logger.error.bind(this.logger))
        this.warn = wrappedMethodCall(this.logger.warn.bind(this.logger))
        this.info = wrappedMethodCall(this.logger.info.bind(this.logger))
        this.debug = wrappedMethodCall(this.logger.debug.bind(this.logger))
        this.trace = wrappedMethodCall(this.logger.trace.bind(this.logger))
    }

    static createName(loggerModule: LoggerModule): string {
        const loggerModuleId = typeof loggerModule === 'string' ? loggerModule : String(loggerModule.id)
        const parsedPath = path.parse(loggerModuleId)
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const longName = without([env.STREAMR_APPLICATION_ID, fileId], undefined).join(':')
        return isPrettyPrintDisabled() ?
            longName : padEnd(longName.substring(0, this.NAME_LENGTH), this.NAME_LENGTH, ' ')
    }
}
