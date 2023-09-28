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
 *   - has 600 DATA sponsored
 *   - it generates 100 DATA of earnings per second
 * - one operator who mines the sponsorship by running one node
 *   - it has operator’s cut of 10%
 * - one external delegator
 *
 * When:
 * - the operator self-delegates 500 DATA
 * - the delegator delegates 526 DATA
 * - operator stakes all delegated tokens (i.e. 1026 DATA)
 * - operator runs the operator node until the sponsorship no longer funded (~6 seconds)
 * - the operator unstakes from the sponsorship
 *   - this triggers withdraw of earnings 
 *   - and the stake is returned to operator contract
 * - the operator and the delegator have earnings:
 *   - all 600 DATA from the sponsorship, excl. protocol fee 30 DATA = 570 DATA
 *   - operator's cut is 57 DATA
 *   - operator token's worth is delegations + profit, excl. operator's cut = 500+526+570-57=1539 DATA
 *     - i.e. the exchange rate is token's worth divide by the delegated DATA = 1539/1026=1.5
 *   - operator auto-delegates the operator's cut of 57 DATA by using the current exchange rate of 1.5
 *     - operator's self-delegation increases by 57/1.5=38 operator tokens
 *     - operator owns (500+38)*1.5=807 DATA
 *     - delegator owns 526*1.5=789 DATA
 *
 * Then:
 * - the operator and the external delegator undelegate all tokens
 * - both the operator and the external delegator receive their staked DATA plus profits to their wallets
 *   - operator receive 807 DATA, i.e. profit is 807-500=307 DATA
 *   - external receive 789 DATA, i.e. profit is 789-526=263 DATA
 * - protocol fee of 30 DATA is transferred to the admin wallet
 */

const SPONSOR_AMOUNT = 600
const OPERATOR_DELEGATED_AMOUNT = 500
const EXTERNAL_DELEGATED_AMOUNT = 526
const EARNINGS_PER_SECOND = 100
const OPERATORS_CUT_PERCENTAGE = 10
const PROTOCOL_FEE_PERCENTAGE = 5 // TODO from config?
const PROTOCOL_FEE = SPONSOR_AMOUNT * (PROTOCOL_FEE_PERCENTAGE / 100)
const TOTAL_PROFIT = SPONSOR_AMOUNT - PROTOCOL_FEE
const OPERATORS_CUT = TOTAL_PROFIT * (OPERATORS_CUT_PERCENTAGE / 100)
const OPERATOR_TOKEN_WORTH_AFTER_MINING = OPERATOR_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT + TOTAL_PROFIT - OPERATORS_CUT
const EXCHANGE_RATE_AFTER_MINING = OPERATOR_TOKEN_WORTH_AFTER_MINING / (OPERATOR_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT)
const OPERATOR_OWNERSHIP_WORTH = OPERATOR_DELEGATED_AMOUNT * EXCHANGE_RATE_AFTER_MINING + OPERATORS_CUT
const DELEGTOR_OWNERSHIP_WORTH = EXTERNAL_DELEGATED_AMOUNT * EXCHANGE_RATE_AFTER_MINING
const OPERATOR_PROFIT = OPERATOR_OWNERSHIP_WORTH - OPERATOR_DELEGATED_AMOUNT
const DELEGATOR_PROFIT = DELEGTOR_OWNERSHIP_WORTH - EXTERNAL_DELEGATED_AMOUNT

describe('profit', () => {

    let operatorWallet: Wallet
    let delegatorWallet: Wallet
    let sponsorWallet: Wallet
    // eslint-disable-next-line no-underscore-dangle
    let _operatorNodeWallet: Wallet
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
            admin: Number(formatEther(await dataToken.balanceOf(adminWallet.address))),
        }
    }

    beforeAll(async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        const streamId = (await createTestStream(client, module)).id
        await client.destroy()
        ;({
            operatorWallet,
            operatorContract,
            nodeWallets: [_operatorNodeWallet]
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
        await delegate(operatorWallet, operatorContract.address, OPERATOR_DELEGATED_AMOUNT)
        await delegate(delegatorWallet, operatorContract.address, EXTERNAL_DELEGATED_AMOUNT)
        await stake(operatorContract, sponsorshipContract.address, OPERATOR_DELEGATED_AMOUNT + EXTERNAL_DELEGATED_AMOUNT)

        /* TODO configure the interval of maintainTopologyValue service so that it callx the
           withdrawMyEarningsFromSponsorships function e.g. 2-3 times during the test run (maybe increase the test time also)
        const broker = await startBroker({
            privateKey: _operatorNodeWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: operatorContract.address
                }
            }
        })*/
        await waitForCondition(async () => !(await sponsorshipContract.isFunded()), 60 * 1000)
        //await broker.stop()

        await unstake(operatorContract, sponsorshipContract.address)
        await undelegate(delegatorWallet, operatorContract, DELEGTOR_OWNERSHIP_WORTH)
        await undelegate(operatorWallet, operatorContract, OPERATOR_OWNERSHIP_WORTH)
        const afterBalances = await getBalances()
        const diff = {
            operator: afterBalances.operator - beforeBalances.operator,
            delegator: afterBalances.delegator - beforeBalances.delegator,
            sponsor: afterBalances.sponsor - beforeBalances.sponsor,
            admin: afterBalances.admin - beforeBalances.admin,
        }
        expect(diff).toEqual({
            operator: OPERATOR_PROFIT,
            delegator: DELEGATOR_PROFIT,
            sponsor: -SPONSOR_AMOUNT,
            admin: PROTOCOL_FEE
        })
    }, 30 * 1000)
})
