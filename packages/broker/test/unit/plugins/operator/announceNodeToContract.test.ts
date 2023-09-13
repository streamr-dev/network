import { MockProxy, mock } from 'jest-mock-extended'
import { NodeID, StreamrClient } from 'streamr-client'
import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'

const NODE_ID = '0x1111' as NodeID

const createHelper = (timestampOfLastHeartbeat: number | undefined): MockProxy<AnnounceNodeToContractHelper> => {
    const helper = mock<AnnounceNodeToContractHelper>()
    helper.getTimestampOfLastHeartbeat.mockImplementation(async () => {
        return timestampOfLastHeartbeat
    })
    helper.writeHeartbeat.mockResolvedValue(undefined)
    return helper
}

describe('announceNodeToContract', () => {

    let streamrClient: MockProxy<StreamrClient>

    beforeAll(() => {
        streamrClient = mock<StreamrClient>()
        streamrClient.getPeerDescriptor.mockResolvedValue({ id: NODE_ID })
    })

    it('writes heartbeat immediately if undefined at start', async () => {
        const helper = createHelper(undefined)
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ id: NODE_ID })
    })

    it('writes heartbeat immediately if already stale at start', async () => {
        const helper = createHelper(Date.now() - 600)
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ id: NODE_ID })
    })

    it('does not write heartbeat immediately if not stale at start', async () => {
        const helper = createHelper(Date.now())
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).not.toHaveBeenCalled()
    })
})
