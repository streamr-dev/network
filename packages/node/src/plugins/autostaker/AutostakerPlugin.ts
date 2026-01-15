import { _operatorContractUtils, SignerWithProvider, SponsorshipCreatedEvent, StreamrClient, TransactionOpts } from '@streamr/sdk'
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
const ACTION_GAS_LIMIT = 750000n
const TRANSACTION_TIMEOUT = 180 * 1000

interface SubmitActionResult {
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

const getStakeOrUnstakeFunction = (action: Action): (
    operatorOwnerWallet: SignerWithProvider,
    operatorContractAddress: string,
    sponsorshipContractAddress: string,
    amount: WeiAmount,
    txOpts: TransactionOpts,
    onSubmit: (tx: ContractTransactionResponse) => void,
    transactionTimeout?: number
) => Promise<ContractTransactionReceipt | null> => {
    switch (action.type) {
        case 'stake':
            return _operatorContractUtils.stake
        case 'unstake':
            return _operatorContractUtils.unstake
        default:
            throw new Error('assertion failed')
    }
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

    // Broadcasts a transaction corresponding to the action without waiting for it to be mined
    private async submitAction(action: Action, signer: SignerWithProvider, txOpts: TransactionOpts): Promise<SubmitActionResult> {
        logger.info(`Execute action: ${action.type} ${formatEther(action.amount)} ${action.sponsorshipId}`)
        const stakeOrUnstakeFunction = getStakeOrUnstakeFunction(action)
        return new Promise((resolve, reject) => {
            const txReceiptPromise = stakeOrUnstakeFunction(signer,
                this.pluginConfig.operatorContractAddress,
                action.sponsorshipId,
                action.amount,
                txOpts,
                // resolve on the onSubmit callback (=tx is broadcasted) instead of when the stakeOrUnstakeFunction resolves (=tx is mined)
                (txResponse) => resolve({ txResponse, txReceiptPromise }),
                TRANSACTION_TIMEOUT 
            )
            // Propagate errors that occur before onSubmit is called
            txReceiptPromise.catch(reject)
        })
    }

    // This will retry the transaction preflight checks, defends against various transient errors
    private async submitActionWithRetry(action: Action, signer: SignerWithProvider, txOpts: TransactionOpts): Promise<SubmitActionResult> {
        return await retry(
            () => this.submitAction(action, signer, txOpts),
            (message, error) => {
                logger.error(message, { error })
            },
            `Submit action to ${action.type} ${formatEther(action.amount)} from ${action.sponsorshipId}`,
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
        logger.info(`Analysis done, proceeding to execute plan with ${actions.length} actions`, {
            actions: actions.map((a) => ({
                ...a,
                amount: formatEther(a.amount)
            }))
        })

        // Ensure that all unstake actions are executed before any stake actions to ensure sufficient liquidity
        const orderedActions = [
            ...actions.filter((a) => a.type === 'unstake'), 
            ...actions.filter((a) => a.type === 'stake')
        ]
        const allSubmitActionPromises: Promise<SubmitActionResult>[] = []

        // Set nonce explicitly, because ethers tends to mess up nonce if we submit 
        // multiple transactions in quick succession
        const address = await signer.getAddress()
        let nonce = await signer.provider.getTransactionCount(address)

        // Broadcast each action but don't wait for them to be mined
        for (const action of orderedActions) {
            const submitActionPromise = this.submitActionWithRetry(action, signer, {
                // Use a fixed gas limit - gas estimation of stake transactions would fails 
                // with "not enough balance", because we first need to unstake before we stake
                gasLimit: ACTION_GAS_LIMIT,
                // Explicit nonce
                nonce: nonce++,
            })
            allSubmitActionPromises.push(submitActionPromise)
        }

        const allReceiptPromises = allSubmitActionPromises.map(async (p) => (await p).txReceiptPromise)

        // Wait for all transactions to be mined (don't stop waiting if some of them fail)
        // Note that if the actual submitted transaction errors, it won't get retried. This should be rare.
        const settledResults = await Promise.allSettled(allReceiptPromises)
        const successfulResults = settledResults.filter((r) => r.status === 'fulfilled')
        const failedResults = settledResults.filter((r) => r.status === 'rejected')
        logger.info(`All actions finished. Successful actions: ${successfulResults.length}, Failed actions: ${failedResults.length}`)
        if (failedResults.length > 0) {
            logger.error('Failed to execute some actions:', { failedResults })
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
