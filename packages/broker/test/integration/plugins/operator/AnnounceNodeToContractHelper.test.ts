import { waitForCondition } from '@streamr/utils'
import { setupOperatorContract } from './contractUtils'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'

// TODO rename test file
describe('AnnounceNodeToContractHelper', () => {

    let contractFacade: ContractFacade

    beforeEach(async () => {
        const { operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        })
        contractFacade = new ContractFacade({
            ...operatorServiceConfig,
            signer: nodeWallets[0]
        })
    })

    it('read empty heartbeat, then write heartbeat then read timestamp', async () => {
        expect(await contractFacade.getTimestampOfLastHeartbeat()).toBeUndefined()

        await contractFacade.writeHeartbeat({
            id: 'foobar'
        })
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
