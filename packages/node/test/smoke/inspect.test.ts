import { config as CHAIN_CONFIG } from '@streamr/config'
import { StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { _operatorContractUtils } from '@streamr/sdk'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, StreamID, TheGraphClient, wait, until, toEthereumAddress, EthereumAddress } from '@streamr/utils'
import { Contract, formatEther, JsonRpcProvider, parseEther, Wallet } from 'ethers'
import fetch from 'node-fetch'
import { Broker, createBroker } from '../../src/broker'
import { createClient, createTestStream, formConfig } from '../utils'
import { OperatorPluginConfig } from './../../src/plugins/operator/OperatorPlugin'

/*
 * The test needs these dependencies:
 * - clean dev-chain in Docker: 
 *   streamr-docker-dev wipe && streamr-docker-dev start dev-chain-fast deploy-network-subgraphs-fastchain
 * - DHT entry point:
 *   <network-repo-root>/bin/run-entry-point.sh
 *
 * Given:
 * - three valid operators running a node
 * - one invalid operator who claims to run a node, but doesn't (i.e. is a freerider)
 * - one sponsorship, and all four operators have staked to it
 *
 * When:
 * - valid operators start to run their nodes
 * - after some time a valid node finds the freerider to be a suspicious operator
 * - the freerider operator is flagged
 * - a review request is sent to two other valid nodes
 * - the reviewer nodes review the freerider
 * - reviewers vote the freerider to be kicked
 * 
 * Then:
 * - freerider is kicked out from sponsorship
 * - freerider is slashed
 * - flagger gets a flaggging reward
 * - voters get voter rewards
 */

const {
    setupTestOperatorContract,
    getTestProvider,
    createTestWallet,
    deployTestSponsorshipContract,
    delegate,
    stake,
    getTestTokenContract,
    getTestAdminWallet,
    getOperatorContract
} = _operatorContractUtils

interface Operator {
    node: Broker
    contractAddress: string
}

const INSPECT_INTERVAL = 2 * 60 * 1000
const REVIEWER_COUNT = 2
const REVIEW_PERIOD = 30
const VOTING_PERIOD = 60
const CLOSE_EXPIRED_FLAGS_INTERVAL = 1 * 60 * 1000
const CLOSE_EXPIRED_FLAGS_MAX_AGE = 30 * 1000
const VALID_OPERATOR_COUNT = 3  // one flagger and at least two voters are needed (see VoteKickPolicy.sol:166)
const MAX_TEST_RUN_TIME = 15 * 60 * 1000

const DELEGATE_WEI = 50000n
const STAKE_WEI = 10000n
const REVIEWER_REWARD_WEI = 700n
const FLAGGER_REWARD_WEI = 900n
const SLASHING_FRACTION = 0.25
const SLASHING_WEI = BigInt(SLASHING_FRACTION * Number(STAKE_WEI))

// two operators and a sponsorship which have been created in dev-chain init
const PRE_BAKED_OPERATORS = [{
    contractAddress: toEthereumAddress('0x8ac1cee54b9133ab7fe5418c826be60a6353d95e'),
    privateKey: '0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae'
}, {
    contractAddress: toEthereumAddress('0xb63c856cf861a88f4fa8587716fdc4e69cdf9ef1'),
    privateKey: '0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0'
}]
const PRE_BAKED_SPONSORSHIP = '0x5fb705aeb6f9a84499c202fc02c33d6f249dc26a'

const DEV_CHAIN_DEFAULT_MINING_INTERVAL = 1000  // hardhat config option in dev-chain

const logger = new Logger(module)

const createStream = async (): Promise<StreamID> => {
    const creator = createClient(await fetchPrivateKeyWithGas())
    const stream = await createTestStream(creator, module)
    await creator.destroy()
    return stream.id
}

const createOperator = async (
    pluginConfig: Partial<Omit<OperatorPluginConfig, 'operatorContractAddress'>>, sponsorshipAddress: EthereumAddress, isFreerider: boolean
): Promise<Operator> => {
    const operator = await setupTestOperatorContract({
        nodeCount: 1,
        operatorConfig: {
            metadata: JSON.stringify({ redundancyFactor: 1 })
        }
    })
    await delegate(operator.operatorWallet, await operator.operatorContract.getAddress(), DELEGATE_WEI)
    await stake(operator.operatorContract, sponsorshipAddress, STAKE_WEI)
    const node = await createBroker(formConfig({
        privateKey: operator.nodeWallets[0].privateKey,
        extraPlugins: {
            operator: {
                operatorContractAddress: await operator.operatorContract.getAddress(),
                ...pluginConfig
            }
        }
    }))
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    logger.info(`Operator: ${(await operator.operatorContract.getAddress()).toLowerCase()} freerider=${isFreerider}`)
    return { node, contractAddress: await operator.operatorContract.getAddress() }
}

const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: CHAIN_CONFIG.dev2.theGraphUrl,
        fetch,
        logger: new Logger(module)
    })
}

const configureBlockchain = async (): Promise<void> => {
    const MINING_INTERVAL = 1100
    logger.info('Configure blockchain')
    const provider = getTestProvider() as JsonRpcProvider
    await provider.send('evm_setAutomine', [true])
    await createStream()  // just some transaction
    await provider.send('evm_setAutomine', [false])
    await provider.send('evm_setIntervalMining', [0])
    const blockNumber = await provider.getBlockNumber()
    const block = (await provider.getBlock(blockNumber))!
    const blockTimestamp = block.timestamp * 1000
    const drift = blockTimestamp - Date.now()
    if (drift >= 0) {
        logger.info(`Wait, blockchain drift is ${(drift / 1000)}s`, { blockNumber, blockTimestamp })
        await wait(drift + 1000)
        logger.info('Set evm_setIntervalMining and evm_setNextBlockTimestamp')
        await provider.send('evm_setIntervalMining', [MINING_INTERVAL])
        await provider.send('evm_setNextBlockTimestamp', [Math.round(Date.now() / 1000)])
    } else {
        logger.warn('Blockchain drift is negative')
        logger.info('Set evm_setIntervalMining')
        await provider.send('evm_setIntervalMining', [MINING_INTERVAL])
    }
    await createStream()  // just some transaction
}

const getFlags = async (
    theGraphClient: TheGraphClient, startTimestamp: number
): Promise<[{ result: string, target: string, flagger: string, votes: [{ voter: string, votedKick: boolean }] }]> => {
    const flagsQuery = `
    {
        flags(where: { flaggingTimestamp_gte: ${Math.round(startTimestamp / 1000)}} ) {
            result
            target {
                id
            }
            flagger {
                id
            }
            votes {
                voter {
                    id
                }
                votedKick
            }
        }
    }`
    const response = await theGraphClient.queryEntity<any>({ query: flagsQuery })
    return response.flags.map((flag: any) => ({
        result: flag.result,
        target: flag.target.id,
        flagger: flag.flagger.id,
        votes: flag.votes.map((vote: any) => ({ voter: vote.voter.id, votedKick: vote.votedKick }))
    }))
}

const getOperatorStakeCount = async (operatorContractAddress: string, theGraphClient: TheGraphClient): Promise<number> => {
    const query = `
    {
        operator(id: "${operatorContractAddress.toLowerCase()}") {
            stakes {
                id
            }
        }
    }`
    const response = await theGraphClient.queryEntity<any>({ query: query })
    return response.operator.stakes.length
}

const getTokenBalance = async (address: string, token: any): Promise<number> => {
    return Number(formatEther(await token.balanceOf(address)))
}

describe('inspect', () => {

    let freeriderOperator: Operator
    const validOperators: Operator[] = []
    let theGraphClient: TheGraphClient
    let startTimestamp: number

    beforeAll(async () => {

        await configureBlockchain()

        logger.info('Update Streamr config')
        const streamrConfig = new Contract(
            CHAIN_CONFIG.dev2.contracts.StreamrConfig,
            streamrConfigABI
        ).connect(getTestAdminWallet()) as unknown as StreamrConfig
        await streamrConfig.setFlagReviewerCount(REVIEWER_COUNT)
        await streamrConfig.setReviewPeriodSeconds(REVIEW_PERIOD)
        await streamrConfig.setVotingPeriodSeconds(VOTING_PERIOD)
        await streamrConfig.setFlagProtectionSeconds(0)
        await streamrConfig.setFlagReviewerRewardWei(parseEther(String(REVIEWER_REWARD_WEI)))
        await streamrConfig.setFlaggerRewardWei(parseEther(String(FLAGGER_REWARD_WEI)))
        await streamrConfig.setSlashingFraction(parseEther(String(SLASHING_FRACTION)))
        logger.info('Setup sponsorship')
        const streamId = await createStream()
        const sponsorer = await createTestWallet()
        const sponsorship = await deployTestSponsorshipContract({ earningsPerSecond: 0n, streamId, deployer: sponsorer })
        logger.info('Create operators')
        freeriderOperator = await createOperator({}, await sponsorship.getAddress(), true)
        const CONFIG = {
            heartbeatUpdateIntervalInMs: 10 * 1000,
            inspectRandomNode: {
                intervalInMs: INSPECT_INTERVAL,
                maxInspectionCount: 1
            },
            reviewSuspectNode: {
                maxInspectionCount: 1,
                maxDelayBeforeFirstInspectionInMs: 10 * 1000
            },
            closeExpiredFlags: {
                intervalInMs: CLOSE_EXPIRED_FLAGS_INTERVAL,
                maxAgeInMs: CLOSE_EXPIRED_FLAGS_MAX_AGE
            }
        }
        for (let i = 0; i < VALID_OPERATOR_COUNT; i++) {
            validOperators.push(await createOperator(CONFIG, await sponsorship.getAddress(), false))
        }

        // Unstake from pre-baked operators so that they won't be selected as voters
        // It would be ok to have some pre-baked operators, but that reduces the probability
        // of selecting the freerider to be inspected when we select a random node.
        // It would also reduce the probability that the nodes started in this test are selected
        // to be reviewers of the suspect node (there would be a subsequent re-flagging if we
        // select only offline nodes, but because of ETH-784 the reviewer set won't change).
        logger.info('Unstake pre-baked operators')
        for (const operator of PRE_BAKED_OPERATORS) {
            const contract = getOperatorContract(operator.contractAddress).connect(new Wallet(operator.privateKey, getTestProvider())) as any
            await (await contract.unstake(PRE_BAKED_SPONSORSHIP)).wait()
        }

        startTimestamp = Date.now()
        logger.info('Start nodes')
        for (const operator of validOperators) {
            await operator.node.start()
        }

        theGraphClient = createTheGraphClient()

    }, 30 * 60 * 1000)

    afterAll(async () => {
        logger.info('Stop nodes')
        for (const operator of validOperators) {
            await operator.node.stop()
        }
        // revert to dev-chain default mining interval
        await (getTestProvider() as JsonRpcProvider).send('evm_setIntervalMining', [DEV_CHAIN_DEFAULT_MINING_INTERVAL])
    })

    /*
     * Note that there is a small chance that freerider isn't selected for any inspection during the
     * test run (because we select inspection targets randomly). In that case the test fails.
     */
    it('freerider is kicked', async () => {

        logger.info('Wait for kick flag')
        await until(async () => {
            const flags = await getFlags(theGraphClient, startTimestamp)
            return flags.some((flag) => flag.result === 'kicked')
        }, MAX_TEST_RUN_TIME, 5000)
        logger.info('Kick flag found')

        // assert that freerider has been flagged, and voted to be kicked
        // and that there are no flags about other nodes
        const accetableFlaggersAndVoters = validOperators.map((o) => o.contractAddress.toLocaleLowerCase())
        const flags = await getFlags(theGraphClient, startTimestamp)
        expect(flags).toHaveLength(1)
        expect(flags[0].result).toBe('kicked')
        expect(flags[0].target).toBe(freeriderOperator.contractAddress.toLocaleLowerCase())
        expect(accetableFlaggersAndVoters.includes(flags[0].flagger)).toBeTrue()
        expect(flags[0].votes.length).toBe(REVIEWER_COUNT)
        for (const vote of flags[0].votes) {
            expect(accetableFlaggersAndVoters.includes(vote.voter)).toBeTrue()
            expect(vote.votedKick).toBe(true)
        }

        // assert that freerider doesn't have the stake in the sponsorship
        // and that others still have the stake there
        const freeriderStakeCount = await getOperatorStakeCount(freeriderOperator.contractAddress, theGraphClient)
        expect(freeriderStakeCount).toEqual(0)
        for (const operator of validOperators) {
            const stakeCount = await getOperatorStakeCount(operator.contractAddress, theGraphClient)
            expect(stakeCount).toEqual(1)
        }

        // assert slashing and rewards
        const token = getTestTokenContract().connect(getTestProvider())
        expect(await getTokenBalance(freeriderOperator.contractAddress, token)).toEqual(DELEGATE_WEI - SLASHING_WEI)
        expect(await getTokenBalance(flags[0].flagger, token)).toEqual(DELEGATE_WEI - STAKE_WEI + FLAGGER_REWARD_WEI)
        for (const voter of flags[0].votes.map((vote) => vote.voter)) {
            expect(await getTokenBalance(voter, token)).toEqual(DELEGATE_WEI - STAKE_WEI + REVIEWER_REWARD_WEI)
        }

    }, 1.1 * MAX_TEST_RUN_TIME)
})
