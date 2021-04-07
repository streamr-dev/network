import pino from 'pino'
import { PeerInfo } from "../connection/PeerInfo"

export function formName(path: string[], context: any | undefined): string {
    let name = path.join(':')
    if (context !== undefined) {
        name += `:${context}`
    }
    return name
}

/**
 * Encapsulate pino.Logger and provide ability to create child loggers that inherit
 * the parent loggers name as their b2ase name.
 */
export class Logger {
    private readonly path: string[]
    private readonly peerInfo: PeerInfo | undefined
    private readonly logger: pino.Logger

    constructor(path: string[], peerInfo?: PeerInfo) {
        this.path = path
        this.peerInfo = peerInfo
        this.logger = pino({
            name: formName(path, peerInfo),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            prettyPrint: process.env.NODE_ENV === 'production' ? false : {
                colorize: true,
                translateTime: true
            }
        })
    }

    createChildLogger(subPath: string[]): Logger {
        return new Logger([...this.path, ...subPath], this.peerInfo)
    }

    fatal(msg: string, ...args: any[]): void {
        this.logger.fatal(msg, ...args)
    }

    error(msg: string, ...args: any[]): void {
        this.logger.error(msg, ...args)
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
