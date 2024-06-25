import { OperatorContractFacade, _operatorContractUtils } from '@streamr/sdk'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'
import { createClient } from '../../../utils'

const TIMEOUT = 30 * 1000

describe('announceNodeToContract', () => {

    let contractFacade: OperatorContractFacade

    beforeEach(async () => {
        const { operatorContract, nodeWallets } = await _operatorContractUtils.setupOperatorContract({
            nodeCount: 1
        })
        contractFacade = await createClient(nodeWallets[0].privateKey)
            .getOperatorContractFacade(toEthereumAddress(await operatorContract.getAddress()))
    }, TIMEOUT)

    it('read empty heartbeat, then write heartbeat then read timestamp', async () => {
        expect(await contractFacade.getTimestampOfLastHeartbeat()).toBeUndefined()

        const streamrClient = {
            getPeerDescriptor: () => ({ nodeId: '1234' })
        }
        await announceNodeToContract(0, contractFacade, streamrClient as any)
        const approximateWriteTimestamp = Date.now()
        await waitForCondition(async () => await contractFacade.getTimestampOfLastHeartbeat() !== undefined, 10 * 1000, 1000)

        // account for (1) the graph to pick up and (2) un-synced time between Docker box and this machine,
        // TODO: why is drift so large (ETH-577)?
        const DELTA = 60 * 15 * 1000

        expect(await contractFacade.getTimestampOfLastHeartbeat()).toBeWithin(
            approximateWriteTimestamp - DELTA,
            approximateWriteTimestamp + DELTA
        )
    }, TIMEOUT)
})
