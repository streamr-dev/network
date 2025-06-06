import { Operator } from '@streamr/sdk'
import { setupTestOperatorContract } from '@streamr/test-utils'
import { until } from '@streamr/utils'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'
import { createClient, deployTestOperatorContract } from '../../../utils'

const TIMEOUT = 30 * 1000

describe('announceNodeToContract', () => {

    let operator: Operator

    beforeEach(async () => {
        const { operatorContractAddress, nodeWallets } = await setupTestOperatorContract({
            nodeCount: 1,
            deployTestOperatorContract
        })
        operator = createClient(nodeWallets[0].privateKey).getOperator(operatorContractAddress)
    }, TIMEOUT)

    it('read empty heartbeat, then write heartbeat then read timestamp', async () => {
        expect(await operator.getTimestampOfLastHeartbeat()).toBeUndefined()

        const streamrClient = {
            getPeerDescriptor: () => ({ nodeId: '1234' })
        }
        await announceNodeToContract(0, operator, streamrClient as any)
        const approximateWriteTimestamp = Date.now()
        await until(async () => await operator.getTimestampOfLastHeartbeat() !== undefined, 10 * 1000, 1000)

        // account for (1) the graph to pick up and (2) un-synced time between Docker box and this machine,
        // TODO: why is drift so large (ETH-577)?
        const DELTA = 60 * 15 * 1000

        expect(await operator.getTimestampOfLastHeartbeat()).toBeWithin(
            approximateWriteTimestamp - DELTA,
            approximateWriteTimestamp + DELTA
        )
    }, TIMEOUT)
})
