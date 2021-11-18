import pino from 'pino'
import path from 'path'
import _ from 'lodash'

export class LoggerCommon {
    static NAME_LENGTH = 20

    static createName(module: NodeJS.Module, context?: string): string {
        const parsedPath = path.parse(String(module.id))
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const appId = process.env.STREAMR_APPLICATION_ID
        const longName = _.without([appId, fileId, context], undefined).join(':')
        return _.padEnd(longName.substring(0, this.NAME_LENGTH), this.NAME_LENGTH, ' ')
    }

    protected readonly logger: pino.Logger

    constructor(options: pino.LoggerOptions, destinationStream?: { write(msg: string): void }, ) {
        this.logger = (destinationStream !== undefined) ? pino(options, destinationStream) : pino(options)
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

    getFinalLogger(): { error: (error: any, origin?: string) => void } {
        const finalLogger = pino.final(this.logger)
        return {
            error: (error: any, origin?: string) => finalLogger.error(error, origin)
        }
    }
}
