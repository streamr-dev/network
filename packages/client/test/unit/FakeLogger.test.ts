import { FakeLogger } from '../test-utils/fake/FakeLogger'

describe('FakeLogger', () => {

    it('happy path', () => {
        const logger = new FakeLogger()
        logger.info('mock message: %s %s', 'param1', 'param2')
        expect(logger.getEntries()).toEqual([{
            message: 'mock message: param1 param2',
            level: 'info'
        }])
    })
})
