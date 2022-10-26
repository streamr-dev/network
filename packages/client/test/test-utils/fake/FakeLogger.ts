import { Logger, LogLevel } from '@streamr/utils'

interface LogMessage {
    text: string
    level: LogLevel
}

const LOG_LINE_PREFIX_LENGTH = 56 // Logger prefixes each line with level, timestamp and context

export class FakeLogger implements Omit<Logger, 'getFinalLogger'> {

    private messages: LogMessage[] = []
    private format: (pattern: string, args: any[], cb: (output: string) => void) => void

    constructor() {
        // format escape sequences (%s, %o etc.) using real Logger
        this.format = (pattern: string, args: any[], cb: (output: string) => void) => {
            const logger = new Logger(module, undefined, 'trace', {
                write: (line: string) => {
                    // eslint-disable-next-line
                    const withoutColors = line.replace(/\x1b\[[0-9]+m/gi, '')
                    const withoutPrefix = withoutColors.substring(LOG_LINE_PREFIX_LENGTH)
                    const withoutLinefeed = withoutPrefix.substring(0, withoutPrefix.length - 1)
                    cb(withoutLinefeed)
                }
            })
            logger.trace(pattern, ...args)
        }
    }

    fatal(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'fatal')
    }

    error(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'error')
    }

    warn(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'warn')
    }

    info(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'info')
    }

    debug(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'debug')
    }

    trace(pattern: string, ...args: any[]): void {
        this.addMessage(pattern, args, 'trace')
    }

    private addMessage(pattern: string, args: any[], level: LogLevel) {
        this.format(pattern, args, (text: string) => {
            this.messages.push({ text, level })
        })
    }

    getMessages(): LogMessage[] {
        return this.messages
    }
}
