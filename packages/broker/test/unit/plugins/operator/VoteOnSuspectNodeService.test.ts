import { inspectSuspectNode } from '../../../../src/plugins/operator/inspectSuspectNode'
import { mock } from 'jest-mock-extended'
import { randomEthereumAddress } from '@streamr/test-utils'
import { VoteOnSuspectNodeHelper } from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'

const SPONSORSHIP = randomEthereumAddress()
const TARGET_OPERATOR = randomEthereumAddress()

describe(inspectSuspectNode, () => {
    it('votes on flag', async () => {
        const voteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        await inspectSuspectNode(voteOnSuspectNodeHelper, SPONSORSHIP, TARGET_OPERATOR, 0)
        expect(voteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledWith(SPONSORSHIP, TARGET_OPERATOR, true)
    })
})
