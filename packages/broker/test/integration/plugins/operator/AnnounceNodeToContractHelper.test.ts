import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { Wallet } from 'ethers'
import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { getProvider, setupOperatorContract } from './contractUtils'

const provider = getProvider()
const chainConfig = CHAIN_CONFIG['dev2']

describe(AnnounceNodeToContractHelper, () => {
    let operatorContract: Operator
    let operatorConfig: OperatorServiceConfig
    let helper: AnnounceNodeToContractHelper

    beforeEach(async () => {
        const nodeWallet = new Wallet(await fetchPrivateKeyWithGas())
        ;({ operatorContract, operatorConfig } = await setupOperatorContract({
            provider,
            chainConfig
        }))
        await (await operatorContract.setNodeAddresses([nodeWallet.address])).wait() // TODO: use setupOperatorContract instead
        helper = new AnnounceNodeToContractHelper({
            ...operatorConfig,
            signer: nodeWallet.connect(operatorConfig.provider)
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
