import { Logger, LogLevel } from '@streamr/utils'

interface LogEntry {
    message: string
    level: LogLevel
}

// @ts-expect-error not implementing logger
export class FakeLogger implements Logger {
    private readonly entries: LogEntry[] = []

    getEntries(): LogEntry[] {
        return this.entries
    }

    debug = jest.fn()
    error = jest.fn()
    fatal = jest.fn()
    info = jest.fn()
    trace = jest.fn()
    warn = jest.fn()
}
