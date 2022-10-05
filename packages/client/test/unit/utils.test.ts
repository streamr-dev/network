import * as utils from '../../src/utils/utils'
import { format, DEFAULT_INSPECT_OPTS } from '../../src/utils/log'

describe('utils', () => {
    describe('getEndpointUrl', () => {
        it('works', () => {
            const streamId = 'x/y'
            const url = utils.getEndpointUrl('http://example.com', 'abc', streamId, 'def')
            expect(url.toLowerCase()).toBe('http://example.com/abc/x%2fy/def')
        })
    })

    describe('util/log', () => {
        const longString = 'longString'.repeat(DEFAULT_INSPECT_OPTS.maxStringLength)
        it('format limits string length', () => {
            expect(format('%o', { longString }).length).toBeLessThan(DEFAULT_INSPECT_OPTS.maxStringLength * 1.2)
        })
    })
})
