import StreamrClient, { _operatorContractUtils, SignerWithProvider } from '@streamr/sdk'
import {
    createTestPrivateKey,
    createTestWallet
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
 * - most/all of that balance is staked to sponsorships
 */

const INITIAL_DELEGATED_AMOUNT = parseEther('500000')
const ADDITIONAL_DELEGATED_AMOUNT = parseEther('100000')
const SPONSORSHIP_1_EARNINGS_PER_SECOND = parseEther('80')
const SPONSORSHIP_1_SPONSOR_AMOUNT = parseEther('1500')
const SPONSORSHIP_2_EARNINGS_PER_SECOND = parseEther('120')
const SPONSORSHIP_2_SPONSOR_AMOUNT = parseEther('12000')
const SPONSORSHIP_3_EARNINGS_PER_SECOND = parseEther('40')
const SPONSORSHIP_3_SPONSOR_AMOUNT = parseEther('24000')
const RUN_INTERVAL = 10 * 1000

const logger = new Logger(module)

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

describe('autostaker', () => {

    let operatorContractAddress: string
    let operator: Wallet & SignerWithProvider
    let operatorNodePrivateKey: string
    let sponsorshipId1: string
    let sponsorshipId2: string
    let sponsorer: SignerWithProvider
    let theGraphClient: TheGraphClient

    beforeAll(async () => {
        theGraphClient = new StreamrClient({ environment: 'dev2' }).getTheGraphClient()
        operator = await createTestWallet({ gas: true, tokens: true })
        const operatorContract = await deployTestOperatorContract({ deployer: operator })
        operatorContractAddress = (await operatorContract.getAddress()).toLowerCase()
        await _operatorContractUtils.delegate(operator, await operatorContract.getAddress(), INITIAL_DELEGATED_AMOUNT)
        const operatorNodeWallet = await createTestWallet({ gas: true, tokens: true })
        operatorNodePrivateKey = operatorNodeWallet.privateKey
        await (await operatorContract.grantRole(await operatorContract.CONTROLLER_ROLE(), operatorNodeWallet.address)).wait()
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
            sponsorshipId1,
            sponsorshipId2
        })
        const operatorNode = await createBroker(formConfig({
            privateKey: operatorNodePrivateKey,
            extraPlugins: {
                autostaker: {
                    operatorContractAddress,
                    runIntervalInMs: RUN_INTERVAL
                }
            }
        }))
        await operatorNode.start()

        let stakes: Map<SponsorshipID, WeiAmount> = new Map()
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return stakes.has(sponsorshipId1) && (stakes.has(sponsorshipId2))
        }, 60 * 1000, 1000)
        logger.info('Both sponsorships have been staked')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId1)).toBe(parseEther('201000'))
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('299000'))

        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return !stakes.has(sponsorshipId1)
        }, 5 * 60 * 1000, 1000)
        logger.info('Expired sponsorship1 has been unstaked')
        expect(stakes.size).toBe(1)
        expect(stakes.get(sponsorshipId1)).toBeUndefined()
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('500000'))

        const sponsorship3 = await deployTestSponsorshipContract({
            earningsPerSecond: SPONSORSHIP_3_EARNINGS_PER_SECOND,
            streamId: (await createStream()),
            deployer: sponsorer
        })
        const sponsorshipId3 = (await sponsorship3.getAddress()).toLowerCase()
        await _operatorContractUtils.sponsor(sponsorer, await sponsorship3.getAddress(), SPONSORSHIP_3_SPONSOR_AMOUNT)
        logger.info(`Deployed sponsorship3: ${sponsorshipId3}`)

        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            return stakes.has(sponsorshipId3)
        }, 60 * 1000, 1000)
        logger.info('Sponsorship3 has been staked')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId1)).toBeUndefined()
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('373568.75'))
        expect(stakes.get(sponsorshipId3)).toBe(parseEther('127856.25'))

        const amountBeforeAdditionalDelegation = (await getStakes(operatorContractAddress, theGraphClient)).get(sponsorshipId3)!
        await _operatorContractUtils.delegate(operator, operatorContractAddress, ADDITIONAL_DELEGATED_AMOUNT)
        await until(async () => {
            stakes = await getStakes(operatorContractAddress, theGraphClient)
            const amount = stakes.get(sponsorshipId3)!
            return amount > amountBeforeAdditionalDelegation
        }, 60 * 1000, 1000)
        logger.info('Stakes have been increased in some sponsorships')
        expect(stakes.size).toBe(2)
        expect(stakes.get(sponsorshipId1)).toBeUndefined()
        expect(stakes.get(sponsorshipId2)).toBe(parseEther('448568.75'))
        expect(stakes.get(sponsorshipId3)).toBe(parseEther('152856.25'))

        await operatorNode.stop()
    }, 30 * 60 * 1000)
})
