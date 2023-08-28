import { createIsLeaderFn } from '../../../../src/plugins/operator/createIsLeaderFn'
import { StreamrClient } from 'streamr-client'
import { mock, MockProxy } from 'jest-mock-extended'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { Logger } from '@streamr/utils'

describe(createIsLeaderFn, () => {
    let client: MockProxy<StreamrClient>
    let operatorFleetState: MockProxy<OperatorFleetState>

    beforeEach(() => {
        client = mock<StreamrClient>()
        operatorFleetState = mock<OperatorFleetState>()
        client.getNodeId.mockResolvedValue('myNodeId')
    })

    it('equality check works on newest info', async () => {
        const isLeader = await createIsLeaderFn(client, operatorFleetState)

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce('leaderNodeId')
        expect(isLeader()).toBeFalse()

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce('myNodeId')
        expect(isLeader()).toBeTrue()

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce(undefined)
        expect(isLeader()).toBeFalse()
    })

    it('logs debug message if passed logger', async () => {
        const logger = mock<Logger>()
        const isLeader = await createIsLeaderFn(client, operatorFleetState, logger)

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce('leaderNodeId')
        isLeader()
        expect(logger.debug).toHaveBeenCalled()
    })
})
