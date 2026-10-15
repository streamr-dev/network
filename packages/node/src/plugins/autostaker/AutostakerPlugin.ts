import {
    _operatorContractUtils,
    type SignerWithProvider,
    type SponsorshipCreatedEvent,
    type StakeIncrease,
    type StakeReduction,
    StreamrClient
} from '@streamr/sdk'
import { collect, Logger, retry, scheduleAtApproximateInterval, TheGraphClient, toEthereumAddress, WeiAmount } from '@streamr/utils'
import { Schema } from 'ajv'
import { ContractTransactionReceipt, ContractTransactionResponse, formatEther, parseEther } from 'ethers'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { adjustStakes } from './payoutProportionalStrategy'
import { Action, SponsorshipConfig, SponsorshipID } from './types'
import { formCoordinationStreamId } from '../operator/formCoordinationStreamId'
import { OperatorFleetState } from '../operator/OperatorFleetState'
import { createIsLeaderFn } from '../operator/createIsLeaderFn'
import { sum } from './sum'

export interface AutostakerPluginConfig {
    operatorContractAddress: string
    maxSponsorshipCount: number
    minTransactionDataTokenAmount: number
    maxAcceptableMinOperatorCount: number
    runIntervalInMs: number
    fleetState: {
        heartbeatUpdateIntervalInMs: number
        pruneAgeInMs: number
        pruneIntervalInMs: number
        latencyExtraInMs: number
        warmupPeriodInMs: number
    }
}

interface SponsorshipQueryResultItem {
    id: SponsorshipID
    totalPayoutWeiPerSec: WeiAmount
    operatorCount: number
    maxOperators: number | null
}

interface StakeQueryResultItem {
    id: string
    sponsorship: {
        id: SponsorshipID
    }
    amountWei: string
}

interface UndelegationQueueQueryResultItem {
    id: string
    amount: string
}

const logger = new Logger('AutostakerPlugin')

// 1e12 wei, i.e. one millionth of one DATA token (we can tweak this later if needed)
const MIN_SPONSORSHIP_TOTAL_PAYOUT_PER_SECOND = 1000000000000n
const ACTION_SUBMIT_RETRY_COUNT = 5
const ACTION_SUBMIT_RETRY_DELAY_MS = 5000
const TRANSACTION_TIMEOUT = 180 * 1000

interface SubmitActionsResult {
    txResponse: ContractTransactionResponse
    txReceiptPromise: Promise<ContractTransactionReceipt | null>
}

const fetchMinStakePerSponsorship = async (theGraphClient: TheGraphClient): Promise<bigint> => {
    const queryResult = await theGraphClient.queryEntity<{ network: { minimumStakeWei: string } }>({
        query: `
            {
                network (id: "network-entity-id") {
                    minimumStakeWei
                }
            }
        `
    })
    return BigInt(queryResult.network.minimumStakeWei)
}

/*
 * Converts the actions to the parameters of the Operator contract's `rebalanceStake` function:
 * unstake actions are expressed as the stake to leave in the sponsorship, and stake actions as the amount to add.
 */
const toRebalanceParams = (
    actions: Action[],
    myCurrentStakes: Map<SponsorshipID, WeiAmount>
): { reductions: StakeReduction[], increases: StakeIncrease[] } => {
    const reductions: StakeReduction[] = []
    const increases: StakeIncrease[] = []
    for (const action of actions) {
        switch (action.type) {
            case 'unstake': {
                const currentAmount = myCurrentStakes.get(action.sponsorshipId)
                if (currentAmount === undefined) {
                    throw new Error(`assertion failed: no current stake for sponsorship ${action.sponsorshipId}`)
                }
                const targetAmount = currentAmount - action.amount
                if (targetAmount < 0n) {
                    throw new Error(`assertion failed: unstake amount exceeds current stake for sponsorship ${action.sponsorshipId}`)
                }
                reductions.push({ sponsorshipContractAddress: action.sponsorshipId, targetAmount })
                break
            }
            case 'stake':
                increases.push({ sponsorshipContractAddress: action.sponsorshipId, amount: action.amount })
                break
            default:
                throw new Error('assertion failed')
        }
    }
    return { reductions, increases }
}

export class AutostakerPlugin extends Plugin<AutostakerPluginConfig> {

    private abortController: AbortController = new AbortController()

    async start(streamrClient: StreamrClient): Promise<void> {
        logger.info('Start autostaker plugin')
        const minStakePerSponsorship = await fetchMinStakePerSponsorship(streamrClient.getTheGraphClient())
        const fleetState = new OperatorFleetState(
            streamrClient,
            formCoordinationStreamId(toEthereumAddress(this.pluginConfig.operatorContractAddress)),
            this.pluginConfig.fleetState.heartbeatUpdateIntervalInMs,
            this.pluginConfig.fleetState.pruneAgeInMs,
            this.pluginConfig.fleetState.pruneIntervalInMs,
            this.pluginConfig.fleetState.latencyExtraInMs,
            this.pluginConfig.fleetState.warmupPeriodInMs
        )
        await fleetState.start()
        await fleetState.waitUntilReady()
        const isLeader = await createIsLeaderFn(streamrClient, fleetState, logger)
        let running = false
        const triggerRun = async () => {
            if (running) {
                logger.info('Previous run still in progress, skipping this run')
                return
            }
            running = true
            try {
                if (isLeader()) {
                    await this.runActions(streamrClient, minStakePerSponsorship)
                }
            } catch (err) {
                logger.warn('Error while running autostaker actions', { err })
            } finally {
                // eslint-disable-next-line require-atomic-updates
                running = false
            }
        }
        logger.info(`First activation in approximately ${this.pluginConfig.runIntervalInMs / (1000 * 60) } minutes`)
        scheduleAtApproximateInterval(triggerRun, this.pluginConfig.runIntervalInMs, 0.1, false, this.abortController.signal)
        streamrClient.on('sponsorshipCreated', (event: SponsorshipCreatedEvent) => {
            // Make sure the The Graph is up-to-date before triggering the run
            logger.info('Detected a new sponsorship at block number', { blockNumber: event.blockNumber })
            streamrClient.getTheGraphClient().updateRequiredBlockNumber(event.blockNumber)
            triggerRun()
        })
        this.abortController.signal.addEventListener('abort', () => {
            streamrClient.off('sponsorshipCreated', triggerRun)
        })
    }

    // Broadcasts a single transaction which executes all the actions atomically, without waiting for it to be mined
    private async submitActions(
        reductions: StakeReduction[],
        increases: StakeIncrease[],
        signer: SignerWithProvider
    ): Promise<SubmitActionsResult> {
        return new Promise((resolve, reject) => {
            const txReceiptPromise = _operatorContractUtils.rebalanceStake(
                signer,
                this.pluginConfig.operatorContractAddress,
                reductions,
                increases,
                {},
                // resolve on the onSubmit callback (=tx is broadcasted) instead of when rebalanceStake resolves (=tx is mined)
                (txResponse) => resolve({ txResponse, txReceiptPromise }),
                TRANSACTION_TIMEOUT
            )
            // Propagate errors that occur before onSubmit is called
            txReceiptPromise.catch(reject)
        })
    }

    // This will retry the transaction preflight checks, defends against various transient errors
    private async submitActionsWithRetry(
        reductions: StakeReduction[],
        increases: StakeIncrease[],
        signer: SignerWithProvider
    ): Promise<SubmitActionsResult> {
        return await retry(
            () => this.submitActions(reductions, increases, signer),
            (message, error) => {
                logger.error(message, { error })
            },
            `Submit rebalance transaction (${reductions.length} unstake actions, ${increases.length} stake actions)`,
            ACTION_SUBMIT_RETRY_COUNT,
            ACTION_SUBMIT_RETRY_DELAY_MS,
        )
    }

    private async runActions(streamrClient: StreamrClient, minStakePerSponsorship: bigint): Promise<void> {
        logger.info('Run analysis')
        const signer = await streamrClient.getSigner()
        const provider = signer.provider
        const operatorContract = _operatorContractUtils.getOperatorContract(this.pluginConfig.operatorContractAddress)
            .connect(provider)
        const myCurrentStakes = await this.getMyCurrentStakes(streamrClient)
        const stakeableSponsorships = await this.getStakeableSponsorships(myCurrentStakes, streamrClient)
        const undelegationQueueAmount = await this.getUndelegationQueueAmount(streamrClient)
        const myStakedAmount = sum([...myCurrentStakes.values()])
        const myUnstakedAmount = (await operatorContract.valueWithoutEarnings()) - myStakedAmount
        logger.debug('Analysis state', {
            stakeableSponsorships: [...stakeableSponsorships.entries()].map(([sponsorshipId, config]) => ({
                sponsorshipId,
                payoutPerSec: formatEther(config.payoutPerSec)
            })),
            myCurrentStakes: [...myCurrentStakes.entries()].map(([sponsorshipId, amount]) => ({
                sponsorshipId,
                amount: formatEther(amount)
            })),
            myUnstakedAmount: formatEther(myUnstakedAmount),
            undelegationQueue: formatEther(undelegationQueueAmount)
        })
        const actions = adjustStakes({
            myCurrentStakes,
            myUnstakedAmount,
            stakeableSponsorships,
            undelegationQueueAmount,
            operatorContractAddress: this.pluginConfig.operatorContractAddress,
            maxSponsorshipCount: this.pluginConfig.maxSponsorshipCount,
            minTransactionAmount: parseEther(String(this.pluginConfig.minTransactionDataTokenAmount)),
            minStakePerSponsorship
        })
        if (actions.length === 0) {
            logger.info('Analysis done, no actions to execute')
            return
        }
        logger.info(`Analysis done, proceeding to execute plan with ${actions.length} actions in one transaction`, {
            actions: actions.map((a) => ({
                ...a,
                amount: formatEther(a.amount)
            }))
        })

        // All actions are executed atomically in a single `rebalanceStake` transaction: the contract first reduces
        // the stakes (which ensures sufficient liquidity) and then stakes into the sponsorships. If any of the
        // actions can't be executed (e.g. a sponsorship is full), the whole transaction fails and no stake is touched.
        const { reductions, increases } = toRebalanceParams(actions, myCurrentStakes)
        const { txResponse, txReceiptPromise } = await this.submitActionsWithRetry(reductions, increases, signer)
        logger.info('Rebalance transaction submitted, waiting for it to be mined', { tx: txResponse.hash })

        // Note that if the actual submitted transaction errors, it won't get retried. This should be rare.
        try {
            const receipt = await txReceiptPromise
            logger.info(`All ${actions.length} actions executed successfully`, { tx: receipt?.hash })
        } catch (err) {
            logger.error('Failed to execute actions', { tx: txResponse.hash, err })
        }
    }

    private async getStakeableSponsorships(
        stakes: Map<SponsorshipID, WeiAmount>,
        streamrClient: StreamrClient
    ): Promise<Map<SponsorshipID, SponsorshipConfig>> {
        const queryResult = streamrClient.getTheGraphClient()
            .queryEntities<SponsorshipQueryResultItem>((lastId: string, pageSize: number, requiredBlockNumber: number) => {
                // TODO add support spnsorships which have non-zero minimumStakingPeriodSeconds (i.e. implement some loggic in the 
                // payoutPropotionalStrategy so that we ensure that unstaking doesn't happen too soon)
                return {
                    query: `
                        {
                            sponsorships (
                                where: {
                                    projectedInsolvency_gt: ${Math.floor(Date.now() / 1000)}
                                    minimumStakingPeriodSeconds: "0"
                                    minOperators_lte: ${this.pluginConfig.maxAcceptableMinOperatorCount}
                                    totalPayoutWeiPerSec_gte: "${MIN_SPONSORSHIP_TOTAL_PAYOUT_PER_SECOND.toString()}"
                                    id_gt: "${lastId}"
                                },
                                first: ${pageSize}
                                block: { number_gte: ${requiredBlockNumber} }
                            ) {
                                id
                                totalPayoutWeiPerSec
                                operatorCount
                                maxOperators
                            }
                        }
                    `
                }
            })
        const sponsorships = await collect(queryResult)
        const hasAcceptableOperatorCount = (item: SponsorshipQueryResultItem) => {
            if (stakes.has(item.id)) {
                // this operator has already staked to the sponsorship: keep the sponsorship in the list so that
                // we don't unstake from it
                return true
            } else {
                return (item.maxOperators === null) || (item.operatorCount < item.maxOperators)
            }
        }
        return new Map(sponsorships.filter(hasAcceptableOperatorCount).map(
            (sponsorship) => [sponsorship.id, {
                payoutPerSec: BigInt(sponsorship.totalPayoutWeiPerSec),
            }])
        )
    }

    private async getMyCurrentStakes(streamrClient: StreamrClient): Promise<Map<SponsorshipID, WeiAmount>> {
        const queryResult = streamrClient.getTheGraphClient()
            .queryEntities<StakeQueryResultItem>((lastId: string, pageSize: number, requiredBlockNumber: number) => {
                return {
                    query: `
                        {
                            stakes (
                                where: {
                                    operator: "${this.pluginConfig.operatorContractAddress.toLowerCase()}",
                                    id_gt: "${lastId}"
                                },
                                first: ${pageSize}
                                block: { number_gte: ${requiredBlockNumber} }
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

    private async getUndelegationQueueAmount(streamrClient: StreamrClient): Promise<WeiAmount> {
        const queryResult = streamrClient.getTheGraphClient()
            .queryEntities<UndelegationQueueQueryResultItem>((lastId: string, pageSize: number, requiredBlockNumber: number) => {
                return {
                    query: `
                        {
                            queueEntries (
                                where:  {
                                    operator: "${this.pluginConfig.operatorContractAddress.toLowerCase()}",
                                    id_gt: "${lastId}"
                                },
                                first: ${pageSize}
                                block: { number_gte: ${requiredBlockNumber} }
                            ) {
                                id
                                amount
                            }
                        }
                    `
                }
            })
        const entries = await collect(queryResult)
        return sum(entries.map((entry) => BigInt(entry.amount)))
    }

    async stop(): Promise<void> {
        logger.info('Stop autostaker plugin')
        this.abortController.abort()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
