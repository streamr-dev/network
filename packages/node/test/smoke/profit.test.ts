import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, Sponsorship } from '@streamr/network-contracts'
import { StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { _operatorContractUtils } from '@streamr/sdk'
import { fetchPrivateKeyWithGas, generateWalletWithGasAndTokens } from '@streamr/test-utils'
import { multiplyWeiAmount, until, WeiAmount } from '@streamr/utils'
import { Contract, Wallet, parseEther } from 'ethers'
import { createClient, createTestStream, startBroker } from '../utils'

/*
 * The test needs these dependencies:
 * - dev-chain in Docker: 
 *   streamr-docker-dev start dev-chain-fast deploy-network-subgraphs-fastchain
 * - DHT entry point:
 *   <network-repo-root>/bin/run-entry-point.sh
 * 
 * Given:
 * - one sponsorship
 * - one operator who mines the sponsorship by running one node
 * - one external delegator
 *
 * When:
 * - the operator self-delegates some DATA tokens
 * - the delegator delegates some DATA tokens
 * - operator stakes all delegated tokens
 * - operator runs the node until the sponsorship is no longer funded
 *
 * Then:
 * - operator value is updated
 * - both the operator and the external delegator receive their staked DATA plus profits to their wallets
 *   when operator unstakes from the sponsorship and the operator and the external delegator undelegate all tokens
 * - protocol fee is transferred to the admin wallet
 */

const {
    setupOperatorContract,
    getProvider,
    deploySponsorshipContract,
    sponsor,
    delegate,
    undelegate,
    stake,
    unstake,
    getTestTokenContract,
    getTestAdminWallet
} = _operatorContractUtils

const SPONSOR_AMOUNT = parseEther('6000')
const OPERATOR_DELEGATED_AMOUNT = parseEther('5000')
const EXTERNAL_DELEGATED_AMOUNT = parseEther('5260')
const EARNINGS_PER_SECOND = parseEther('1000')
const OPERATORS_CUT_PERCENTAGE = 10
const PROTOCOL_FEE_PERCENTAGE = 5
const PROTOCOL_FEE = multiplyWeiAmount(SPONSOR_AMOUNT, PROTOCOL_FEE_PERCENTAGE / 100)
const TOTAL_PROFIT = SPONSOR_AMOUNT - PROTOCOL_FEE
const TOTAL_DELEGATED = OPERATOR_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT
const OPERATORS_CUT = multiplyWeiAmount(TOTAL_PROFIT, OPERATORS_CUT_PERCENTAGE / 100)
const OPERATOR_PROFIT_WHEN_NO_WITHDRAWALS = (TOTAL_PROFIT - OPERATORS_CUT) * OPERATOR_DELEGATED_AMOUNT / TOTAL_DELEGATED + OPERATORS_CUT
const DELEGATOR_PROFIT_WHEN_NO_WITHDRAWALS = (TOTAL_PROFIT - OPERATORS_CUT) * EXTERNAL_DELEGATED_AMOUNT / TOTAL_DELEGATED
// If the operator doesn't make any withdrawals during the sponsorship period, the profit is split between 
// the operator and the delegator based on their respective delegated amounts. However, if there are withdrawals,
// the operator gets a larger share of the profit. This happens because the operator's delegated amount
// grows by both their profit share and their cut of the total profit, while the external delegator's amount
// only grows by their profit share.
const PROFIT_INACCURACY = parseEther('50')

describe('profit', () => {

    let operatorWallet: Wallet
    let delegatorWallet: Wallet
    let sponsorWallet: Wallet
    let operatorNodeWallet: Wallet
    let operatorContract: Operator
    let sponsorshipContract: Sponsorship

    const getBalances = async (): Promise<{
        operator: WeiAmount
        delegator: WeiAmount
        sponsor: WeiAmount
        admin: WeiAmount
        operatorContract: WeiAmount
    }> => {
        const dataToken = getTestTokenContract().connect(getProvider())
        const adminWallet = getTestAdminWallet()
        return {
            operator: await dataToken.balanceOf(operatorWallet.address),
            delegator: await dataToken.balanceOf(delegatorWallet.address),
            sponsor: await dataToken.balanceOf(sponsorWallet.address),
            admin: await dataToken.balanceOf(adminWallet.address),
            operatorContract: await dataToken.balanceOf(await operatorContract.getAddress()),
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
                operatorsCutPercentage: OPERATORS_CUT_PERCENTAGE
            },
            generateWalletWithGasAndTokens
        }))
        sponsorshipContract = await deploySponsorshipContract({
            earningsPerSecond: EARNINGS_PER_SECOND,
            streamId,
            deployer: operatorWallet // could be any wallet with gas
        })
        sponsorWallet = await generateWalletWithGasAndTokens()
        delegatorWallet = await generateWalletWithGasAndTokens()
        const streamrConfig = new Contract(
            CHAIN_CONFIG.dev2.contracts.StreamrConfig,
            streamrConfigABI
        ).connect(getTestAdminWallet()) as unknown as StreamrConfig
        await streamrConfig.setProtocolFeeFraction(parseEther(String(PROTOCOL_FEE_PERCENTAGE / 100)))
        await streamrConfig.setMinimumDelegationSeconds(0)
    }, 60 * 1000)

    it('happy path', async () => {
        const beforeBalances = await getBalances()
        await sponsor(sponsorWallet, await sponsorshipContract.getAddress(), SPONSOR_AMOUNT)
        await delegate(operatorWallet, await operatorContract.getAddress(), OPERATOR_DELEGATED_AMOUNT)
        await delegate(delegatorWallet, await operatorContract.getAddress(), EXTERNAL_DELEGATED_AMOUNT)
        await stake(operatorContract, await sponsorshipContract.getAddress(), OPERATOR_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT)
 
        const broker = await startBroker({
            privateKey: operatorNodeWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: await operatorContract.getAddress(),
                    maintainOperatorValue: {
                        intervalInMs: 500,
                        withdrawLimitSafetyFraction: 1
                    },
                    fleetState: {
                        latencyExtraInMs: 0,
                        warmupPeriodInMs: 0
                    },
                    heartbeatUpdateIntervalInMs: 500
                }
            }
        })
        await until(async () => !(await sponsorshipContract.isFunded()), 60 * 1000)
        await until(async () => {
            const operatorValue = (await getBalances()).operatorContract
            return (operatorValue === TOTAL_PROFIT)
        })
        await broker.stop()

        await unstake(operatorContract, await sponsorshipContract.getAddress())
        await undelegate(
            delegatorWallet,
            operatorContract,
            EXTERNAL_DELEGATED_AMOUNT + DELEGATOR_PROFIT_WHEN_NO_WITHDRAWALS
        )
        await undelegate(
            operatorWallet,
            operatorContract,
            OPERATOR_DELEGATED_AMOUNT + OPERATOR_PROFIT_WHEN_NO_WITHDRAWALS + PROFIT_INACCURACY
        )
        const afterBalances = await getBalances()
        expect(afterBalances.operatorContract).toEqual(0n)
        const diff = {
            operator: afterBalances.operator - beforeBalances.operator,
            delegator: afterBalances.delegator - beforeBalances.delegator,
            sponsor: afterBalances.sponsor - beforeBalances.sponsor,
            admin: afterBalances.admin - beforeBalances.admin,
        }
        expect(diff.operator).toBeGreaterThanOrEqual(OPERATOR_PROFIT_WHEN_NO_WITHDRAWALS)
        expect(diff.operator).toBeLessThanOrEqual(OPERATOR_PROFIT_WHEN_NO_WITHDRAWALS + PROFIT_INACCURACY)
        expect(diff.delegator).toBeGreaterThanOrEqual(DELEGATOR_PROFIT_WHEN_NO_WITHDRAWALS - PROFIT_INACCURACY)
        expect(diff.delegator).toBeLessThanOrEqual(DELEGATOR_PROFIT_WHEN_NO_WITHDRAWALS)
        expect(diff.sponsor).toEqual(-SPONSOR_AMOUNT)
        expect(diff.admin).toEqual(PROTOCOL_FEE)
    }, 30 * 1000)
})
