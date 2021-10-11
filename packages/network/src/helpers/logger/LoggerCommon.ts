import pino from 'pino'

export class LoggerCommon {
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
