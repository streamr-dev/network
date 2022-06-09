import assert from 'assert'
import { KeyExchangeStreamIDUtils } from '../../../src/utils/KeyExchangeStreamID'
import { toStreamID } from '../../../src/utils/StreamID'

describe('formKeyExchangeStreamID', () => {
    it('forms key-exchange stream ids', () => {
        expect(KeyExchangeStreamIDUtils.formKeyExchangeStreamID('0xFaFa1234')).toEqual('SYSTEM/keyexchange/0xfafa1234')
    })
})

describe('isKeyExchangeStream', () => {
    it('returns true for streams that start with the correct prefix', () => {
        assert(KeyExchangeStreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchange/0x1234'))
        assert(KeyExchangeStreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchange/foo'))
    })
    it('returns false for other streams', () => {
        assert(!KeyExchangeStreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchangefoo'))
    })
})

describe('getRecipient', () => {
    it('returns recipient in the case of a key-exchange stream', () => {
        const streamId = toStreamID('SYSTEM/keyexchange/0x1234')
        expect(KeyExchangeStreamIDUtils.getRecipient(streamId)).toEqual('0x1234')
    })

    it('returns undefined in the case of a non-key-exchange stream', () => {
        const address = '0xaAAAaaaaAA123456789012345678901234567890'
        const streamId = toStreamID('/foo/BAR', address)
        expect(KeyExchangeStreamIDUtils.getRecipient(streamId)).toBeUndefined()
    })
})