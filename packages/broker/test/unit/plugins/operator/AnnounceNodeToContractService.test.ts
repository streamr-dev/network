import { AnnounceNodeToContractService } from '../../../../src/plugins/operator/AnnounceNodeToContractService'
import StreamrClient, { NetworkNodeType } from 'streamr-client'
import { mock, MockProxy } from 'jest-mock-extended'
import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { wait, waitForCondition } from '@streamr/utils'
import { NetworkNode } from '@streamr/trackerless-network'

function setUp({
    nodeId,
    leaderNodeId,
    initialHeartbeatTs,
    writeIntervalInMs,
    pollIntervalInMs
}: {
    nodeId: string
    leaderNodeId: string | string[]
    initialHeartbeatTs: number | undefined
    writeIntervalInMs: number
    pollIntervalInMs: number
}): { service: AnnounceNodeToContractService, helper: MockProxy<AnnounceNodeToContractHelper> } {
    let heartbeatTs: number | undefined = initialHeartbeatTs
    const networkNode = mock<NetworkNode>()
    const streamrClient = mock<StreamrClient>()
    const helper = mock<AnnounceNodeToContractHelper>()
    const operatorFleetState = mock<OperatorFleetState>()

    networkNode.getNodeId.mockReturnValue(nodeId)
    streamrClient.getNode.mockResolvedValue(networkNode)
    streamrClient.getPeerDescriptor.mockResolvedValue({ id: nodeId, type: NetworkNodeType.NODEJS })
    if (typeof leaderNodeId === 'string') {
        operatorFleetState.getLeaderNodeId.mockReturnValue(leaderNodeId)
    } else {
        for (const id of leaderNodeId) {
            operatorFleetState.getLeaderNodeId.mockReturnValueOnce(id)
        }
    }
    helper.getTimestampOfLastHeartbeat.mockImplementation(async () => {
        return heartbeatTs
    })
    helper.writeHeartbeat.mockImplementation(async () => {
        await wait(0)
        heartbeatTs = Date.now()
    })

    const service = new AnnounceNodeToContractService(
        streamrClient,
        helper,
        operatorFleetState,
        writeIntervalInMs,
        pollIntervalInMs
    )
    return { service, helper }
}

describe(AnnounceNodeToContractService, () => {
    it('writes heartbeat immediately if undefined at start', async () => {
        const { service, helper } = setUp({
            nodeId: 'myNodeId',
            leaderNodeId: 'myNodeId',
            initialHeartbeatTs: undefined,
            writeIntervalInMs: 500,
            pollIntervalInMs: 50
        })
        await service.start()
        await wait(150)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ id: 'myNodeId', type: NetworkNodeType.NODEJS })
        await service.stop()
    })

    it('writes heartbeat immediately if already stale at start', async () => {
        const { service, helper } = setUp({
            nodeId: 'myNodeId',
            leaderNodeId: 'myNodeId',
            initialHeartbeatTs: Date.now() - 600,
            writeIntervalInMs: 500,
            pollIntervalInMs: 50
        })
        await service.start()
        await wait(150)
        expect(helper.writeHeartbeat).toHaveBeenCalledWith({ id: 'myNodeId', type: NetworkNodeType.NODEJS })
        await service.stop()
    })

    it('does not write heartbeat immediately if not stale at start', async () => {
        const { service, helper } = setUp({
            nodeId: 'myNodeId',
            leaderNodeId: 'myNodeId',
            initialHeartbeatTs: Date.now(),
            writeIntervalInMs: 500,
            pollIntervalInMs: 50
        })
        await service.start()
        await wait(150)
        expect(helper.writeHeartbeat).not.toHaveBeenCalled()
        await service.stop()
    })

    it('does not write heartbeat if not leader', async () => {
        const { service, helper } = setUp({
            nodeId: 'myNodeId',
            leaderNodeId: 'leaderNodeId',
            initialHeartbeatTs: undefined,
            writeIntervalInMs: 50,
            pollIntervalInMs: 25
        })
        await service.start()
        await wait(150)
        expect(helper.writeHeartbeat).not.toHaveBeenCalled()
        await service.stop()
    })

    it('longer scenario', async () => {
        const { service, helper } = setUp({
            nodeId: 'myNodeId',
            leaderNodeId: [
                'myNodeId',
                'myNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'myNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'leaderNodeId',
                'leaderNodeId',
            ],
            initialHeartbeatTs: undefined,
            writeIntervalInMs: 60,
            pollIntervalInMs: 30
        })
        await service.start()
        await waitForCondition(() => helper.writeHeartbeat.mock.calls.length >= 3)
        await wait(100)
        expect(helper.writeHeartbeat).toHaveBeenCalledTimes(3)
    })
})
