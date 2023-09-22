import { Wallet } from '@ethersproject/wallet'
import type { Operator, Sponsorship } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { formatEther } from 'ethers/lib/utils'
import {
    delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    getAdminWallet,
    getProvider,
    getTokenContract,
    setupOperatorContract,
    sponsor,
    stake,
    undelegate,
    unstake
} from '../../integration/plugins/operator/contractUtils'
import { createClient, createTestStream, startBroker } from '../../utils'

/*
 * Given:
 * - one sponsorship
 *   - it generates 20 DATA of earnings per second
 * - one operator who mines the sponsorship by running one node
 *   - it has operator’s cut of 10%
 * - one external delegator
 *
 * When:
 * - the operator self-delegates 123 DATA
 * - the external delegator delegates 200 DATA
 * - operator stakes all delegated tokens (i.e. 300 DATA)
 * - operator runs the operator node until the sponsorship no longer funded (~30 seconds)
 * - operator unstakes all delegated tokens
 * - operator and the external delegator undelegate all tokens
 *
 * - protocol fee is 5% of 600 DATA = 30 DATA
 * - operator's cut is 10% of the remaining 570 = 57 DATA
 *   - the operator has automatically self-delegated that amount
 *   - therefore the stakes after that are: operator 123+57=180 DATA, external delegator 200 DATA
 * - their share of the 570 DATA profit is:
 *   - operator: 180/380*570 = 270 DATA
 *   - extrenal delegator: 200/380*570 = 300 DATA
 *
 * Then:
 * - both the operator and the external delegator receive their staked DATA plus profits to their wallets
 *   - operator has 270+123=393 DATA
 *   - external delegator has 300+200=500 DATA
 * - protocol fee of 3 DATA is transferred to the admin wallet
 */

const SPONSOR_AMOUNT = 600
const SELF_DELEGATED_AMOUNT = 123
const EXTERNAL_DELEGATED_AMOUNT = 200
const EARNINGS_PER_SECOND = 20
const OPERATORS_CUT_PERCENTAGE = 10
const PROTOCOL_FEE_PERCENTAGE = 5 // TODO from config?

describe('profit', () => {

    let operatorWallet: Wallet
    let delegatorWallet: Wallet
    let sponsorWallet: Wallet
    let operatorNodeWallet: Wallet
    let operatorContract: Operator
    let sponsorshipContract: Sponsorship

    const getBalances = async (): Promise<{
        operator: number
        delegator: number
        sponsor: number
        admin: number
    }> => {
        const dataToken = getTokenContract().connect(getProvider())
        const adminWallet = getAdminWallet()
        return {
            operator: Number(formatEther(await dataToken.balanceOf(operatorWallet.address))),
            delegator: Number(formatEther(await dataToken.balanceOf(delegatorWallet.address))),
            sponsor: Number(formatEther(await dataToken.balanceOf(sponsorWallet.address))),
            admin: Number(formatEther(await dataToken.balanceOf(adminWallet.address)))
        }
    }

    beforeAll(async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        const streamId = (await createTestStream(client, module)).id
        await client.destroy()
        ;({
            operatorWallet,
            operatorContract,
            nodeWallets: [operatorNodeWallet]
        } = await setupOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                operatorsCutPercent: OPERATORS_CUT_PERCENTAGE
            }
        }))
        sponsorshipContract = await deploySponsorshipContract({
            earningsPerSecond: EARNINGS_PER_SECOND,
            streamId,
            deployer: operatorWallet
        })
        sponsorWallet = await generateWalletWithGasAndTokens()
        delegatorWallet = await generateWalletWithGasAndTokens()
    }, 60 * 1000)

    it('happy path', async () => {
        const beforeBalances = await getBalances()
        await sponsor(sponsorWallet, sponsorshipContract.address, SPONSOR_AMOUNT)
        await delegate(operatorWallet, operatorContract.address, SELF_DELEGATED_AMOUNT)
        await delegate(delegatorWallet, operatorContract.address, EXTERNAL_DELEGATED_AMOUNT)
        await stake(operatorContract, sponsorshipContract.address, SELF_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT)

        const broker = await startBroker({
            privateKey: operatorNodeWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: operatorContract.address
                }
            }
        })
        await waitForCondition(async () => !(await sponsorshipContract.isFunded()), 60 * 1000)
        await broker.stop()

        await unstake(operatorContract, sponsorshipContract.address)
        await undelegate(delegatorWallet, operatorContract, EXTERNAL_DELEGATED_AMOUNT)
        await undelegate(operatorWallet, operatorContract, SELF_DELEGATED_AMOUNT)  // TODO does not work before ETH-606
        const afterBalances = await getBalances()
        const diff = {
            operator: afterBalances.operator - beforeBalances.operator,
            delegator: afterBalances.delegator - beforeBalances.delegator,
            sponsor: afterBalances.sponsor - beforeBalances.sponsor,
            admin: afterBalances.admin - beforeBalances.admin,
        }
        const protocolFee = SPONSOR_AMOUNT * (PROTOCOL_FEE_PERCENTAGE / 100)
        const totalProfit = SPONSOR_AMOUNT - protocolFee
        const operatorsCut = totalProfit * (OPERATORS_CUT_PERCENTAGE / 100)
        const totalDelegatedAmount = SELF_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT + operatorsCut
        expect(diff).toEqual({
            operator: (totalProfit - operatorsCut) * (SELF_DELEGATED_AMOUNT + operatorsCut / totalDelegatedAmount),
            delegator: (totalProfit - operatorsCut) * (EXTERNAL_DELEGATED_AMOUNT / totalDelegatedAmount),
            sponsor: -SPONSOR_AMOUNT,
            admin: protocolFee
        })
    }, 120 * 1000)
})
