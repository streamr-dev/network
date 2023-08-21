import { waitForCondition } from '@streamr/utils'
import { Wallet } from 'ethers'
import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { setupOperatorContract } from './contractUtils'

describe(AnnounceNodeToContractHelper, () => {

    let nodeWallets: Wallet[]
    let operatorConfig: OperatorServiceConfig
    let helper: AnnounceNodeToContractHelper

    beforeEach(async () => {
        ({ operatorConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        }))
        helper = new AnnounceNodeToContractHelper({
            ...operatorConfig,
            signer: nodeWallets[0].connect(operatorConfig.provider)
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
        // TODO: why is drift so large?
        const DELTA = 60 * 5 * 1000

        expect(await helper.getTimestampOfLastHeartbeat()).toBeWithin(
            approximateWriteTimestamp - DELTA,
            approximateWriteTimestamp + DELTA
        )
    })
})
