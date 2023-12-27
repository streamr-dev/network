import { DhtAddress } from '@streamr/dht'
import { MockProxy, mock } from 'jest-mock-extended'
import { NetworkNodeType, StreamrClient } from 'streamr-client'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'

const NODE_ID = '0x1111' as DhtAddress

const createHelper = (timestampOfLastHeartbeat: number | undefined): MockProxy<ContractFacade> => {
    const helper = mock<ContractFacade>()
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
        streamrClient.getPeerDescriptor.mockResolvedValue({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('writes heartbeat immediately if undefined at start', async () => {
        const helper = createHelper(undefined)
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('writes heartbeat immediately if already stale at start', async () => {
        const helper = createHelper(Date.now() - 600)
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('does not write heartbeat immediately if not stale at start', async () => {
        const helper = createHelper(Date.now())
        await announceNodeToContract(500, helper, streamrClient)
        expect(helper.writeHeartbeat).not.toHaveBeenCalled()
    })
})
