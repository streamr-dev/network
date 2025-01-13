import { StreamPartIDUtils } from '@streamr/utils'
import { streamPartIdToDataKey } from '../../src/logic/ContentDeliveryManager'

describe('StreamPartIDtoDataKey', () => {
    it('generated key length is correct (160 bits)', () => {
        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const dataKey = streamPartIdToDataKey(streamPartId)
        expect(dataKey.length).toEqual(40)
    })
})
