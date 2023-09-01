import { waitForCondition } from '@streamr/utils'
import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { setupOperatorContract } from './contractUtils'

describe(AnnounceNodeToContractHelper, () => {

    let helper: AnnounceNodeToContractHelper

    beforeEach(async () => {
        const { operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        })
        helper = new AnnounceNodeToContractHelper({
            ...operatorServiceConfig,
            signer: nodeWallets[0]
        })
    })

    it('read empty heartbeat, then write heartbeat then read timestamp', async () => {
        expect(await helper.getTimestampOfLastHeartbeat()).toBeUndefined()

        await helper.writeHeartbeat({
            id: 'foobar'
        })
        const approximateWriteTimestamp = Date.now()
        await waitForCondition(async () => await helper.getTimestampOfLastHeartbeat() !== undefined, 10 * 1000, 1000)

        // account for (1) the graph to pick up and (2) un-synced time between Docker box and this machine,
        // TODO: why is drift so large (ETH-577)?
        const DELTA = 60 * 15 * 1000

        expect(await helper.getTimestampOfLastHeartbeat()).toBeWithin(
            approximateWriteTimestamp - DELTA,
            approximateWriteTimestamp + DELTA
        )
    })
})
