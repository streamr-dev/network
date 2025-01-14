import { Logger } from '../src/Logger'
import pino from 'pino'
import path from 'path'
import { pick } from 'lodash'

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any

describe('Logger', () => {
    let logger: Logger
    let logs: { level: unknown; msg: unknown }[]

    beforeEach(() => {
        logs = []
        const dest = {
            write: (data: string) => {
                logs.push(pick(JSON.parse(data), ['level', 'msg']))
            }
        }
        logger = new Logger(
            module,
            undefined,
            'trace',
            pino(
                {
                    level: 'trace',
                    browser: {
                        write: (o) => {
                            logs.push({
                                level: (o as any).level,
                                msg: (o as any).msg
                            })
                        }
                    }
                },
                dest
            )
        )
    })

    it('delegates call to fatal to pino.Logger#fatal', async () => {
        logger.fatal('mock message')
        expect(logs[0]).toEqual({
            level: 60,
            msg: 'mock message'
        })
    })

    it('delegates call to error to pino.Logger#error', () => {
        logger.error('mock message')
        expect(logs[0]).toEqual({
            level: 50,
            msg: 'mock message'
        })
    })

    it('delegates call to warn to pino.Logger#warn', () => {
        logger.warn('mock message')
        expect(logs[0]).toEqual({
            level: 40,
            msg: 'mock message'
        })
    })

    it('delegates call to info to pino.Logger#info', () => {
        logger.info('mock message')
        expect(logs[0]).toEqual({
            level: 30,
            msg: 'mock message'
        })
    })

    it('delegates call to debug to pino.Logger#debug', () => {
        logger.debug('mock message')
        expect(logs[0]).toEqual({
            level: 20,
            msg: 'mock message'
        })
    })

    it('delegates call to trace to pino.Logger#trace', () => {
        logger.trace('mock message')
        expect(logs[0]).toEqual({
            level: 10,
            msg: 'mock message'
        })
    })

    describe('name', () => {
        it('short', () => {
            const expected = typeof _streamr_electron_test === 'undefined' ? 'Logger.test              ' : 'Logger.test'
            expect(Logger.createName(module)).toBe(expected)
        })
        it('application id', () => {
            const expected =
                typeof _streamr_electron_test === 'undefined' ? 'APP:Logger.test          ' : 'APP:Logger.test'
            process.env.STREAMR_APPLICATION_ID = 'APP'
            expect(Logger.createName(module)).toBe(expected)
            delete process.env.STREAMR_APPLICATION_ID
        })
        it('index', () => {
            const expected = typeof _streamr_electron_test === 'undefined' ? 'mock                     ' : 'mock'
            expect(
                Logger.createName({
                    id: ['foo', 'bar', 'mock', 'index'].join(path.sep)
                } as any)
            ).toBe(expected)
        })
    })
})
