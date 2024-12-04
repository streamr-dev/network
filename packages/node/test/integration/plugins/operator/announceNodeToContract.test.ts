import { Operator, _operatorContractUtils } from '@streamr/sdk'
import { toEthereumAddress, until } from '@streamr/utils'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'
import { createClient } from '../../../utils'

const TIMEOUT = 30 * 1000

describe('announceNodeToContract', () => {

    let operator: Operator

    beforeEach(async () => {
        const { operatorContract, nodeWallets } = await _operatorContractUtils.setupTestOperatorContract({
            nodeCount: 1
        })
        operator = createClient(nodeWallets[0].privateKey).getOperator(toEthereumAddress(await operatorContract.getAddress()))
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
