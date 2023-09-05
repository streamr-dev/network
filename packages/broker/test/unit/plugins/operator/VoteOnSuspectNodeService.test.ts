import { VoteOnSuspectNodeService } from '../../../../src/plugins/operator/VoteOnSuspectNodeService'
import { mock, MockProxy } from 'jest-mock-extended'
import { NodeID, StreamrClient } from 'streamr-client'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { randomEthereumAddress } from '@streamr/test-utils'
import {
    ReviewRequestCallback,
    VoteOnSuspectNodeHelper
} from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'

const SPONSORSHIP = randomEthereumAddress()
const TARGET_OPERATOR = randomEthereumAddress()

describe(VoteOnSuspectNodeService, () => {
    let streamrClient: MockProxy<StreamrClient>
    let operatorFleetState: MockProxy<OperatorFleetState>
    let voteOnSuspectNodeHelper: MockProxy<VoteOnSuspectNodeHelper>
    let service: VoteOnSuspectNodeService
    let capturedHandleNodeInspectionRequest: ReviewRequestCallback

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        operatorFleetState = mock<OperatorFleetState>()
        voteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        voteOnSuspectNodeHelper.start.mockImplementationOnce(async (cb) => {
            capturedHandleNodeInspectionRequest = cb
        })
        service = new VoteOnSuspectNodeService(voteOnSuspectNodeHelper, streamrClient, operatorFleetState)
    })

    it('waits for operator fleet state become ready at start', async () => {
        await service.start()
        expect(operatorFleetState.waitUntilReady).toHaveBeenCalledTimes(1)
    })

    it('invokes VoteOnSuspectNodeHelper start at start', async () => {
        await service.start()
        expect(voteOnSuspectNodeHelper.start).toHaveBeenCalledTimes(1)
    })

    it('invokes VoteOnSuspectNodeHelper stop at stop', async () => {
        await service.start()
        service.stop()
        expect(voteOnSuspectNodeHelper.stop).toHaveBeenCalledTimes(1)
    })

    it('votes on flag if leader', async () => {
        voteOnSuspectNodeHelper.voteOnFlag.mockResolvedValue(undefined)
        streamrClient.getNodeId.mockResolvedValue('nodeId' as NodeID)
        operatorFleetState.getLeaderNodeId.mockReturnValue('nodeId' as NodeID)
        await service.start()
        capturedHandleNodeInspectionRequest(SPONSORSHIP, TARGET_OPERATOR, 5)
        expect(voteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledWith(SPONSORSHIP, TARGET_OPERATOR, true)
    })

    it('does not vote on flag if not leader', async () => {
        voteOnSuspectNodeHelper.voteOnFlag.mockResolvedValue(undefined)
        streamrClient.getNodeId.mockResolvedValue('nodeId' as NodeID)
        operatorFleetState.getLeaderNodeId.mockReturnValue('leaderId' as NodeID)
        await service.start()
        capturedHandleNodeInspectionRequest(SPONSORSHIP, TARGET_OPERATOR, 5)
        expect(voteOnSuspectNodeHelper.voteOnFlag).not.toHaveBeenCalled()
    })
})
