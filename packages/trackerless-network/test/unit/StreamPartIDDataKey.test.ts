import { StreamPartIDUtils } from '@streamr/protocol'
import { streamPartIdToDataKey } from '../../src/logic/EntryPointDiscovery'

describe('StreamPartIDtoDataKey', () => {

    it('generated key length is correct (160 bits)', () => {
        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const dataKey = streamPartIdToDataKey(streamPartId)
        expect(dataKey.length).toEqual(40)
    })

})
