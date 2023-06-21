import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { mock, MockProxy } from 'jest-mock-extended'
import StreamrClient from 'streamr-client'
import { toEthereumAddress } from '@streamr/utils'
import { toStreamID } from '@streamr/protocol'

const ADDRESS = toEthereumAddress('0x61BBf708Fb7bB1D4dA10D1958C88A170988d3d1F')
const coordinationStreamId = toStreamID('/operator/coordination', ADDRESS)

describe(OperatorFleetState, () => {
    let streamrClient: MockProxy<StreamrClient>
    let state: OperatorFleetState

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        state = new OperatorFleetState(streamrClient, coordinationStreamId)
    })

    it('cannot double start', async () => {
        await state.start()
        await expect(() => state.start()).toThrowError()
    })
})
