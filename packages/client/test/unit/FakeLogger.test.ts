import { FakeLogger } from '../test-utils/fake/FakeLogger'

describe('FakeLogger', () => {

    it('happy path', () => {
        const logger = new FakeLogger()
        logger.info('mock message: %s %s', 'param1', 'param2')
        expect(logger.info).toHaveBeenCalledTimes(1)
        expect(logger.info).toHaveBeenLastCalledWith('mock message: %s %s', 'param1', 'param2')
    })
})
