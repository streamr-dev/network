import { Logger, formName } from "../../src/helpers/Logger"
import { PeerInfo } from "../../src/connection/PeerInfo"
import Mock = jest.Mock

const address = '0x9fd57ed5530e425c6efb724dc667ce54245944fd'
const peerInfoNoName = PeerInfo.newNode(address)
const peerInfoWithName = PeerInfo.newNode(address, 'nice-node')

test.each([
    [[], undefined, ''],
    [[], peerInfoNoName, ':<0x9fd57e>'],
    [[], peerInfoWithName, ':nice-node<0x9fd57e>'],
    [['Manager'], undefined, 'Manager'],
    [['Manager'], peerInfoNoName, 'Manager:<0x9fd57e>'],
    [['Manager'], peerInfoWithName, 'Manager:nice-node<0x9fd57e>'],
    [['logic', 'Manager'], undefined, 'logic:Manager'],
    [['logic', 'Manager'], peerInfoNoName, 'logic:Manager:<0x9fd57e>'],
    [['logic', 'Manager'], peerInfoWithName, 'logic:Manager:nice-node<0x9fd57e>'],
    [['streamr', 'logic', 'Manager'], undefined, 'streamr:logic:Manager'],
    [['streamr', 'logic', 'Manager'], peerInfoNoName, 'streamr:logic:Manager:<0x9fd57e>'],
    [['streamr', 'logic', 'Manager'], peerInfoWithName, 'streamr:logic:Manager:nice-node<0x9fd57e>']
])('formName(%p, %p) === %s', (arg1: string[], arg2: PeerInfo | undefined, expected: string) => {
    expect(formName(arg1, arg2)).toEqual(expected)
})

describe(Logger, () => {
    let logger: Logger
    let fatalFn: Mock
    let errorFn: Mock
    let warnFn: Mock
    let infoFn: Mock
    let debugFn: Mock
    let traceFn: Mock

    beforeAll(() => {
        logger = new Logger(['a', 'b', 'TestCase'], peerInfoWithName)
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

    it('can create child logger', () => {
        const childLogger = logger.createChildLogger(['c, d'])
        expect(childLogger).toBeInstanceOf(Logger)
    })
})