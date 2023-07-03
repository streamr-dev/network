import { AnnounceNodeService } from '../../../../src/plugins/operator/AnnounceNodeService'
import { StreamrClient } from 'streamr-client'
import { mock, mockClear, MockProxy } from 'jest-mock-extended'
import { toEthereumAddress, wait } from '@streamr/utils'
import { toStreamID } from '@streamr/protocol'

const ADDRESS = toEthereumAddress('0x61BBf708Fb7bB1D4dA10D1958C88A170988d3d1F')
const NODE_ID = toEthereumAddress('0xA3B2B8AAAC099833275b1f7fCC415E121326D38c')
const INTERVAL_IN_MS = 25

describe(AnnounceNodeService, () => {

    let streamrClient: MockProxy<StreamrClient>
    let service: AnnounceNodeService

    beforeEach(async () => {
        streamrClient = mock<StreamrClient>()
        streamrClient.getNode.mockResolvedValue({
            getNodeId: () => NODE_ID
        } as any)
        streamrClient.publish.mockResolvedValue(null as any)
        service = new AnnounceNodeService(streamrClient, ADDRESS, INTERVAL_IN_MS)
        await service.start()
    })

    afterEach(async () => {
        await service?.stop()
    })

    it('publishes a heartbeat every 10 seconds', async () => {
        await wait(INTERVAL_IN_MS * 12)
        expect(streamrClient.publish.mock.calls.length).toBeGreaterThan(10)
        expect(streamrClient.publish).toHaveBeenCalledWith(toStreamID('/operator/coordination', ADDRESS), {
            msgType: 'heartbeat',
            nodeId: NODE_ID
        })
    })

    it('stops publishing heartbeats when stopped', async () => {
        await wait(INTERVAL_IN_MS * 4)
        mockClear(streamrClient)
        await service.stop()
        await wait(INTERVAL_IN_MS * 4)
        expect(streamrClient.publish).not.toHaveBeenCalled()
    })
})
