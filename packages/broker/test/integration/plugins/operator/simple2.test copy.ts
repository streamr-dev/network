/* eslint-disable */
import { formatEther, parseEther } from 'ethers/lib/utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'
import { createClient, createTestStream } from '../../../utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { Contract } from '@ethersproject/contracts'

const STAKE_AMOUNT = 100
const MIN_EARNINGS = 2
const ONE_ETHER = 1e18

it('simple test2', async () => {
    const client = createClient(await fetchPrivateKeyWithGas())
    const streamId = (await createTestStream(client, module)).id
    await client.destroy()
    const { operatorWallet, operatorContract, nodeWallets } = await setupOperatorContract({
        nodeCount: 1,
        operatorConfig: {
            operatorsCutPercent: 10
        }
    })
    const sponsorer = await generateWalletWithGasAndTokens()
    const sponsorship = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
    await sponsor(sponsorer, sponsorship.address, 250)
    await delegate(operatorWallet, operatorContract.address, STAKE_AMOUNT)
    await stake(operatorContract, sponsorship.address, STAKE_AMOUNT)

    const cut = await operatorContract.operatorsCutFraction()
    const cfg = new Contract(CHAIN_CONFIG.dev2.contracts.StreamrConfig, streamrConfigABI).connect(operatorWallet) as StreamrConfig
    const penaltyFraction = await cfg.poolValueDriftPenaltyFraction()
    console.log('Cut: ' + formatEther(cut))
    console.log('Penalty fraction: ' + formatEther(penaltyFraction))
    
    console.log('Min earnings ' + MIN_EARNINGS)
    console.log('Poll for earnings')
    await waitForCondition(async () => {
        const earnings = Number(await operatorContract.getEarningsFromSponsorship(sponsorship.address)) / ONE_ETHER
        console.log('Earnings: ' + earnings)
        return earnings >= MIN_EARNINGS
    }, 10000, 1000)

    console.log('Withdraw')

    await (await operatorContract.connect(nodeWallets[0]).withdrawEarningsFromSponsorships([sponsorship.address])).wait()
    
    const earnings = Number(await operatorContract.getEarningsFromSponsorship(sponsorship.address)) / ONE_ETHER
    console.log('Earnings after withdraw ' + earnings)

    await wait(5000)
}, 60 * 1000)
