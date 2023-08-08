import { AnnounceNodeToContractHelper } from '../../../../src/plugins/operator/AnnounceNodeToContractHelper'
import { setupOperatorContract } from './setupOperatorContract'
import { getProvider } from './smartContractUtils'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { Wallet } from 'ethers'
import type { Operator } from "@streamr/network-contracts"
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'

const provider = getProvider()
const chainConfig = CHAIN_CONFIG['dev2']
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`

describe(AnnounceNodeToContractHelper, () => {
    let operatorContract: Operator
    let operatorConfig: OperatorServiceConfig
    let helper: AnnounceNodeToContractHelper

    beforeEach(async () => {
        const nodeWallet = new Wallet((await fetchPrivateKeyWithGas()))
        ;({ operatorContract, operatorConfig } = await setupOperatorContract({
            provider,
            chainConfig,
            theGraphUrl
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
        const DELTA = 180 * 1000

        expect(await helper.getTimestampOfLastHeartbeat()).toBeWithin(
            approximateWriteTimestamp - DELTA,
            approximateWriteTimestamp + DELTA
        )
    })
})
