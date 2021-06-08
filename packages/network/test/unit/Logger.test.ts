import path from 'path'
import { Logger } from "../../src/helpers/Logger"
import Mock = jest.Mock

describe(Logger, () => {
    let logger: Logger
    let fatalFn: Mock
    let errorFn: Mock
    let warnFn: Mock
    let infoFn: Mock
    let debugFn: Mock
    let traceFn: Mock

    beforeAll(() => {
        logger = new Logger(module)
        // @ts-expect-error accessing-private
        fatalFn = logger.logger.fatal = jest.fn()
        // @ts-expect-error accessing-private
        errorFn = logger.logger.error = jest.fn()
        // @ts-expect-error accessing-private
        warnFn = logger.logger.warn = jest.fn()
        // @ts-expect-error accessing-private
        infoFn = logger.logger.info = jest.fn()
        // @ts-expect-error accessing-private
        debugFn = logger.logger.debug = jest.fn()
        // @ts-expect-error accessing-private
        traceFn = logger.logger.trace = jest.fn()
    })

    it('delegates call to fatal to pino.Logger#fatal', () => {
        logger.fatal('disaster %s!', 123)
        expect(fatalFn).toBeCalledTimes(1)
    })

    it('delegates call to error to pino.Logger#error', () => {
        logger.error('an error or something %s', 123)
        expect(errorFn).toBeCalledTimes(1)
    })

    it('delegates call to warn to pino.Logger#warn', () => {
        logger.warn('a warning %s!', 123)
        expect(warnFn).toBeCalledTimes(1)
    })

    it('delegates call to info to pino.Logger#info', () => {
        logger.info('here be information %s!', 123)
        expect(infoFn).toBeCalledTimes(1)
    })

    it('delegates call to debug to pino.Logger#debug', () => {
        logger.debug('debugging internals %s...', 123)
        expect(debugFn).toBeCalledTimes(1)
    })

    it('delegates call to trace to pino.Logger#trace', () => {
        logger.trace('tracing %s...', 123)
        expect(traceFn).toBeCalledTimes(1)
    })

    describe('name', () => {
        it('short', () => {
            // @ts-expect-error private method
            expect(Logger.createName(module)).toBe('Logger.test         ')
        })
        it('short with context', () => {
            // @ts-expect-error private method
            expect(Logger.createName(module, 'foobar')).toBe('Logger.test:foobar  ')
        })
        it('long with context', () => {
            // @ts-expect-error private method
            expect(Logger.createName(module, 'loremipsum')).toBe('Logger.test:loremips')    
        })
        it('application id', () => {
            process.env.STREAMR_APPLICATION_ID = 'APP'
            // @ts-expect-error private method
            expect(Logger.createName(module)).toBe('APP:Logger.test     ')
            delete process.env.STREAMR_APPLICATION_ID
        })
        it('index', () => {
            // @ts-expect-error private method
            expect(Logger.createName({
                filename: ['foo', 'bar', 'mock', 'index'].join(path.sep)
            } as any)).toBe('mock                ') 
        })
    })

    test('error object', () => {
        let lines: string[]
        const logger = new Logger(module, '', {
            write: (msg: string) => {
                lines = msg.split('\n').map((line) => line.trim())
            }
        })
        logger.error('log message', new SyntaxError('error message'))
        expect(lines!.length >= 7)
        // eslint-disable-next-line
        const [ main, _errorTag, errorType, errorMessage, _stackTag, _errorDescription, firstStackFrame ] = lines!
        expect(main.includes('ERROR')).toBeTruthy()
        expect(main.includes('log message')).toBeTruthy()
        expect(errorType.includes('SyntaxError'))
        expect(errorMessage.includes('error message'))
        expect(firstStackFrame.startsWith('at ')).toBeTruthy()
    })
})