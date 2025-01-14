import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { toEthereumAddress } from '@streamr/utils'

describe(formCoordinationStreamId, () => {
    it('forms coordination stream id', () => {
        const address = toEthereumAddress('0x1234567890123456789012345678901234567890')
        expect(formCoordinationStreamId(address)).toEqual(
            '0x1234567890123456789012345678901234567890/operator/coordination'
        )
    })
})
