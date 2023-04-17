import { Logger } from '@streamr/utils'

// @ts-expect-error not implementing logger
export class FakeLogger implements Logger {
    debug = jest.fn()
    error = jest.fn()
    fatal = jest.fn()
    info = jest.fn()
    trace = jest.fn()
    warn = jest.fn()
}
