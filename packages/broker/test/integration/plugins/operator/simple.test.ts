import { parseEther } from 'ethers/lib/utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'
import { createClient, createTestStream } from '../../../utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from '../../../../src/plugins/operator/MaintainOperatorPoolValueHelper'
import { getTotalUnwithdrawnEarnings } from './operatorPoolValueUtils'

const STAKE_AMOUNT = 100
const ONE_ETHER = 1e18
const SAFETY_FRACTION = 0.5

it('simple test', async () => {
    const client = createClient(await fetchPrivateKeyWithGas())
    const streamId = (await createTestStream(client, module)).id
    await client.destroy()
    const { operatorWallet, operatorContract, operatorServiceConfig, nodeWallets } = await setupOperatorContract({
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
    const helper = new MaintainOperatorPoolValueHelper({ ...operatorServiceConfig, signer: nodeWallets[0] })
    const driftLimitFraction = await helper.getDriftLimitFraction()
    const driftLimit = STAKE_AMOUNT * Number(driftLimitFraction) / ONE_ETHER
    const safeDriftLimit = driftLimit * SAFETY_FRACTION
    console.log('Poll for earnings')
    await waitForCondition(async () => {
        const unwithdrawnEarnings = Number(await getTotalUnwithdrawnEarnings(operatorContract)) / ONE_ETHER
        console.log('Earnings: ' + unwithdrawnEarnings)
        return unwithdrawnEarnings > safeDriftLimit
    }, 10000, 1000)

    console.log('Withdraw')
    await (await operatorContract.connect(nodeWallets[0]).withdrawEarningsFromSponsorships([sponsorship.address])).wait()
    
    const earnings = Number(await operatorContract.getEarningsFromSponsorship(sponsorship.address)) / ONE_ETHER
    console.log('Earnings after withdraw ' + earnings)

    await wait(5000)
}, 30 * 1000)