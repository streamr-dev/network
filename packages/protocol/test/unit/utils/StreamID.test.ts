import assert from 'assert'
import { Utils } from '../../../src'

// TODO: write unit test

describe('isKeyExchangeStream', () => {
    it('returns true for streams that start with the correct prefix', () => {
        assert(Utils.isKeyExchangeStream('SYSTEM/keyexchange/0x1234'))
        assert(Utils.isKeyExchangeStream('SYSTEM/keyexchange/foo'))
    })
    it('returns false for other streams', () => {
        assert(!Utils.isKeyExchangeStream('SYSTEM/keyexchangefoo'))
    })
})