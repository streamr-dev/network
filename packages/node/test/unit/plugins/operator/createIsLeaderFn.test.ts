import { createIsLeaderFn } from '../../../../src/plugins/operator/createIsLeaderFn'
import type { StreamrClient } from '@streamr/sdk'
import { mock, MockProxy } from 'jest-mock-extended'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { Logger } from '@streamr/utils'
import { DhtAddress } from '@streamr/dht'

const MY_NODE_ID = '0x1111' as DhtAddress
const LEADER_NODE_ID = '0x2222' as DhtAddress

describe(createIsLeaderFn, () => {
    let client: MockProxy<StreamrClient>
    let operatorFleetState: MockProxy<OperatorFleetState>

    beforeEach(() => {
        client = mock<StreamrClient>()
        operatorFleetState = mock<OperatorFleetState>()
        client.getNodeId.mockResolvedValue(MY_NODE_ID)
    })

    it('equality check works on newest info', async () => {
        const isLeader = await createIsLeaderFn(client, operatorFleetState)

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce(LEADER_NODE_ID)
        expect(isLeader()).toBeFalse()

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce(MY_NODE_ID)
        expect(isLeader()).toBeTrue()

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce(undefined)
        expect(isLeader()).toBeFalse()
    })

    it('logs debug message if passed logger', async () => {
        const logger = mock<Logger>()
        const isLeader = await createIsLeaderFn(client, operatorFleetState, logger)

        operatorFleetState.getLeaderNodeId.mockReturnValueOnce('leaderNodeId' as DhtAddress)
        isLeader()
        expect(logger.debug).toHaveBeenCalled()
    })
})
