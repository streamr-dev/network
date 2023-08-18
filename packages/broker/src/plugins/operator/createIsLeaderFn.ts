import StreamrClient from 'streamr-client'
import { OperatorFleetState } from './OperatorFleetState'
import { Logger } from '@streamr/utils'

export async function createIsLeaderFn(
    streamrClient: StreamrClient,
    operatorFleetState: OperatorFleetState,
    logger?: Logger
): Promise<() => boolean> {
    const myNodeId = (await streamrClient.getNode()).getNodeId()
    return () => {
        const leaderNodeId = operatorFleetState.getLeaderNodeId()
        const isLeader = myNodeId === leaderNodeId
        logger?.debug('Check whether leader', { isLeader, leaderNodeId, myNodeId })
        return isLeader
    }
}
