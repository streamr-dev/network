import { Logger } from '../src/Logger'
import pino from 'pino'
import { pick } from 'lodash'
import path from 'path'

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any

describe('Logger', () => {
    let logger: Logger
    let logs: Array<{ level: unknown, msg: unknown }>

    beforeEach(() => {
        logs = []
        const dest = {
            write: (data: string) => {
                logs.push(pick(JSON.parse(data), ['level', 'msg']))
            }
        }
        logger = new Logger(module, undefined, 'trace', pino({}, dest))
    })

    it('delegates call to fatal to pino.Logger#fatal', async () => {
        logger.fatal('disaster %s!', 123)
        expect(logs).toEqual([{
            level: 60,
            msg: 'disaster 123!'
        }])
    })

    it('delegates call to error to pino.Logger#error', () => {
        logger.error('an error or something %s', 123)
        expect(logs).toEqual([{
            level: 50,
            msg: 'an error or something 123'
        }])
    })

    it('delegates call to warn to pino.Logger#warn', () => {
        logger.warn('a warning %s!', 123)
        expect(logs).toEqual([{
            level: 40,
            msg: 'a warning 123!'
        }])
    })

    it('delegates call to info to pino.Logger#info', () => {
        logger.info('here be information %s!', 123)
        expect(logs).toEqual([{
            level: 30,
            msg: 'here be information 123!'
        }])
    })

    it('delegates call to debug to pino.Logger#debug', () => {
        logger.debug('debugging internals %s...', 123)
        expect(logs).toEqual([{
            level: 20,
            msg: 'debugging internals 123...'
        }])
    })

    it('delegates call to trace to pino.Logger#trace', () => {
        logger.trace('tracing %s...', 123)
        expect(logs).toEqual([{
            level: 10,
            msg: 'tracing 123...'
        }])
    })

    describe('name', () => {
        it('short', () => {
            expect(Logger.createName(module)).toBe('Logger.test         ')
        })
        it('short with context', () => {
            expect(Logger.createName(module, 'foobar')).toBe('foobar:Logger.test  ')
        })
        it('long with context', () => {
            expect(Logger.createName(module, 'loremipsum')).toBe('loremipsum:Logger.te')
        })
        it('application id', () => {
            process.env.STREAMR_APPLICATION_ID = 'APP'
            expect(Logger.createName(module)).toBe('APP:Logger.test     ')
            delete process.env.STREAMR_APPLICATION_ID
        })
        it('index', () => {
            expect(Logger.createName({
                id: ['foo', 'bar', 'mock', 'index'].join(path.sep)
            } as any)).toBe('mock                ')
        })
    })
})
