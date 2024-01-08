import { waitForCondition } from '@streamr/utils'
import { setupOperatorContract } from './contractUtils'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'

describe('announceNodeToContract', () => {

    let contractFacade: ContractFacade

    beforeEach(async () => {
        const { operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        })
        contractFacade = ContractFacade.createInstance({
            ...operatorServiceConfig,
            signer: nodeWallets[0]
        })
    })

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
    })
})
