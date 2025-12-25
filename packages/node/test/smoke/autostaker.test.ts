import StreamrClient, { _operatorContractUtils, SignerWithProvider } from '@streamr/sdk'
import {
    createTestPrivateKey,
    createTestWallet,
    setupTestOperatorContract,
    getTestProvider,
    getTestTokenContract
} from '@streamr/test-utils'
import { collect, Logger, StreamID, TheGraphClient, until, WeiAmount } from '@streamr/utils'
import { parseEther, Wallet } from 'ethers'
import { createBroker } from '../../src/broker'
import { SponsorshipID } from '../../src/plugins/autostaker/types'
import { createClient, createTestStream, deployTestOperatorContract, deployTestSponsorshipContract, formConfig } from '../utils'

/*
 * The test needs these dependencies:
 * - clean dev-chain in Docker: 
 *   streamr-docker-dev wipe && streamr-docker-dev start dev-chain-fast deploy-network-subgraphs-fastchain
 * - DHT entry point:
 *   <network-repo-root>/bin/run-entry-point.sh
 * 
 * Given:
 * - one operator who has some delegated tokens
 * - two sponsorships, both having relatively good payout
 * 
 * When:
 * - the operator starts to run a node with Autostaker plugin
 * 
 * Then:
 * - the operator stakes to both sponsorships
 * 
 * When:
 * - one of the sponsorships expire
 * 
 * Then:
 * - the operator unstakes from it
 * 
 * When:
 * - new sponsorship is created with relatively good payout
 * 
 * Then:
 * - the operator stakes to it
 * 
 * When:
 * - operator's delegated token balance is increased
 * 
 * Then:
 * - most/all of that increased balance is staked to sponsorships
 * 
 * When:
 * - operator's delegated token balance is decreased
 * 
 * Then:
 * - operator unstakes the undelegated amount from the sponorships
 * - delegator receives the undelegated tokens
 */

const INITIAL_DELEGATED_AMOUNT = parseEther('500000')
const DELEGATION_INCREMENT_AMOUNT = parseEther('100000')
const DELEGATION_DECREMENT_AMOUNT = parseEther('20000')
const SPONSORSHIP_1_EARNINGS_PER_SECOND = parseEther('80')
const SPONSORSHIP_1_SPONSOR_AMOUNT = parseEther('1500')
const SPONSORSHIP_2_EARNINGS_PER_SECOND = parseEther('120')
const SPONSORSHIP_2_SPONSOR_AMOUNT = parseEther('90000')
const SPONSORSHIP_3_EARNINGS_PER_SECOND = parseEther('40')
const SPONSORSHIP_3_SPONSOR_AMOUNT = parseEther('90000')
const RUN_INTERVAL = 10 * 1000

const logger = new Logger('autostaker.test')

const createStream = async (): Promise<StreamID> => {
    const creator = createClient(await createTestPrivateKey({ gas: true }))
    const stream = await createTestStream(creator, module)
    await creator.destroy()
    return stream.id
}

const getStakes = async (operatorContractAddress: string, theGraphClient: TheGraphClient): Promise<Map<SponsorshipID, WeiAmount>> => {
    interface StakeQueryResultItem {
        id: string
        sponsorship: {
            id: SponsorshipID
        }
        amountWei: WeiAmount
    }
    const queryResult = theGraphClient.queryEntities<StakeQueryResultItem>((lastId: string, pageSize: number) => {
        return {
            query: `
                {
                    stakes(
                        where:  {
                            operator: "${operatorContractAddress.toLowerCase()}",
                            id_gt: "${lastId}"
                        },
                        first: ${pageSize}
                    ) {
                        id
                        sponsorship {
                            id
                        }
                        amountWei
                    }
                }
            `
        }
    })
    const stakes = await collect(queryResult)
    return new Map(stakes.map((stake) => [stake.sponsorship.id, BigInt(stake.amountWei) ]))
}

const getTokenBalance = async (address: string): Promise<WeiAmount> => {
    return getTestTokenContract().connect(getTestProvider()).balanceOf(address)
}

describe('autostaker', () => {

    let operatorContractAddress: string
    let operator: Wallet & SignerWithProvider
    let operatorNodePrivateKey: string
    let delegator: SignerWithProvider
    let sponsorshipId1: string
    let sponsorshipId2: string
    let sponsorer: SignerWithProvider
    let theGraphClient: TheGraphClient

    beforeAll(async () => {
        theGraphClient = new StreamrClient({ environment: 'dev2' }).getTheGraphClient()
        const operatorContractSetupResult = await setupTestOperatorContract({
            nodeCount: 1,
            deployTestOperatorContract
        })
        operatorContractAddress = operatorContractSetupResult.operatorContractAddress.toLowerCase()
        operator = operatorContractSetupResult.operatorWallet
        operatorNodePrivateKey = operatorContractSetupResult.nodeWallets[0].privateKey
        const operatorContract = _operatorContractUtils.getOperatorContract(operatorContractAddress).connect(operator)
        await (await operatorContract.grantRole(
            await operatorContract.CONTROLLER_ROLE(),
            operatorContractSetupResult.nodeWallets[0].address)
        ).wait()
        await _operatorContractUtils.delegate(
            operatorContractSetupResult.operatorWallet,
            operatorContractAddress,
            INITIAL_DELEGATED_AMOUNT
        )
        delegator = await createTestWallet({ gas: true, tokens: true })
        sponsorer = await createTestWallet({ gas: true, tokens: true })
        const sponsorship1 = await deployTestSponsorshipContract({
            earningsPerSecond: SPONSORSHIP_1_EARNINGS_PER_SECOND,
            streamId: (await createStream()),
            deployer: sponsorer
        })
        await _operatorContractUtils.sponsor(sponsorer, await sponsorship1.getAddress(), SPONSORSHIP_1_SPONSOR_AMOUNT)
        sponsorshipId1 = (await sponsorship1.getAddress()).toLowerCase()
        const sponsorship2 = await deployTestSponsorshipContract({
            earningsPerSecond: SPONSORSHIP_2_EARNINGS_PER_SECOND,
            streamId: (await createStream()),
            deployer: sponsorer
        })
        sponsorshipId2 = (await sponsorship2.getAddress()).toLowerCase()
        await _operatorContractUtils.sponsor(sponsorer, await sponsorship2.getAddress(), SPONSORSHIP_2_SPONSOR_AMOUNT)
    })

    it('happy path', async () => {

        logger.info('Start', {
            operatorContractAddress,
            delegatorAddress: await delegator.getAddress(), 
            sponsorshipId1,
            sponsorshipId2
        })
        const operatorNode = await createBroker(formConfig({
            privateKey: operatorNodePrivateKey,
            extraPlugins: {
                autostaker: {
                    operatorContractAddress,
                    runIntervalInMs: RUN_INTERVAL
                },
                // start operator plugin so that heartbeats are published for the fleet state leader analysis
                operator: {
                    operatorContractAddress
                }
            }
        }))
        await operatorNode.start()

        logger.info('Wait until sponsorships have been staked')
        let stakes: Map<SponsorshipID, WeiAmount> = new Map()
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return stakes.has(sponsorshipId1) && (stakes.has(sponsorshipId2))
        }, 60 * 1000, 1000)
        logger.info('Sponsorships have been staked')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId1)).toBe(parseEther('201000'))
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('299000'))

        logger.info('Wait until sponsorship1 expires')
        const stakesBeforeSponsorship1Expiration = stakes
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return !stakes.has(sponsorshipId1) 
                && (stakes.get(sponsorshipId2) !== stakesBeforeSponsorship1Expiration.get(sponsorshipId2))
        }, 5 * 60 * 1000, 1000)
        logger.info('Sponsorship1 has been unstaked')
        expect(stakes.size).toBe(1)
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('500000'))

        logger.info('Deploy sponsorship3')
        const sponsorship3 = await deployTestSponsorshipContract({
            earningsPerSecond: SPONSORSHIP_3_EARNINGS_PER_SECOND,
            streamId: (await createStream()),
            deployer: sponsorer
        })
        const sponsorshipId3 = (await sponsorship3.getAddress()).toLowerCase()
        await _operatorContractUtils.sponsor(sponsorer, await sponsorship3.getAddress(), SPONSORSHIP_3_SPONSOR_AMOUNT)
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return stakes.has(sponsorshipId3)
        }, 60 * 1000, 1000)
        logger.info('Sponsorship3 has been staked')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('373568.75'))
        expect(stakes.get(sponsorshipId3)).toBe(parseEther('127856.25'))

        logger.info('Increase delegated amount')
        const stakesBeforeDelegationIncrease = stakes
        await _operatorContractUtils.delegate(delegator, operatorContractAddress, DELEGATION_INCREMENT_AMOUNT)
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return (stakes.get(sponsorshipId2) !== stakesBeforeDelegationIncrease.get(sponsorshipId2)) 
                && (stakes.get(sponsorshipId3) !== stakesBeforeDelegationIncrease.get(sponsorshipId2))
        }, 60 * 1000, 1000)
        logger.info('Stakes have been increased in some sponsorships')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('448568.75'))
        expect(stakes.get(sponsorshipId3)).toBe(parseEther('152856.25'))

        logger.info('Decrease delegated amount')
        const stakesBeforeDelegationDecrease = stakes
        const delegatorBalanceBeforeUndelegation = await getTokenBalance(await delegator.getAddress())
        await _operatorContractUtils.undelegate(delegator, operatorContractAddress, DELEGATION_DECREMENT_AMOUNT)
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return (stakes.get(sponsorshipId2) !== stakesBeforeDelegationDecrease.get(sponsorshipId2)) 
                && (stakes.get(sponsorshipId3) !== stakesBeforeDelegationDecrease.get(sponsorshipId2))
        }, 5 * 60 * 1000, 1000)
        logger.info('Stakes have been decreased in some sponsorships')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('433568.75'))
        expect(stakes.get(sponsorshipId3)).toBe(parseEther('147856.25'))
        // delegator receives also earnings, therefore the balance increases more than DELEGATION_DECREMENT_AMOUNT
        expect(await getTokenBalance(await delegator.getAddress())).toBeGreaterThan(delegatorBalanceBeforeUndelegation - DELEGATION_DECREMENT_AMOUNT)

        await operatorNode.stop()
    }, 30 * 60 * 1000)
})
