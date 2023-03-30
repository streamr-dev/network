import { Logger, LogLevel } from '@streamr/utils'
import * as util from 'util'

interface LogEntry {
    message: string
    level: LogLevel
}

// @ts-expect-error not implementing logger
export class FakeLogger implements Logger {
    private readonly entries: LogEntry[] = []

    fatal(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'fatal')
    }

    error(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'error')
    }

    warn(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'warn')
    }

    info(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'info')
    }

    debug(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'debug')
    }

    trace(pattern: string, ...args: any[]): void {
        this.addEntry(pattern, args, 'trace')
    }

    private addEntry(pattern: string, args: any[], level: LogLevel) {
        this.entries.push({
            message: util.format(pattern, ...args), // pino.Logger probably not using util.format internally...
            level
        })
    }

    getEntries(): LogEntry[] {
        return this.entries
    }
}
