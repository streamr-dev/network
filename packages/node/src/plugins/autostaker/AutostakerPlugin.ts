import { _operatorContractUtils, SignerWithProvider, StreamrClient } from '@streamr/sdk'
import { collect, Logger, scheduleAtApproximateInterval, TheGraphClient, WeiAmount } from '@streamr/utils'
import { Schema } from 'ajv'
import { formatEther, parseEther } from 'ethers'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { adjustStakes } from './payoutProportionalStrategy'
import { Action, SponsorshipConfig, SponsorshipID } from './types'
import { sum } from './sum'

export interface AutostakerPluginConfig {
    operatorContractAddress: string
    maxSponsorshipCount: number
    minTransactionDataTokenAmount: number
    maxAcceptableMinOperatorCount: number
    runIntervalInMs: number
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
    amountWei: WeiAmount
}

const logger = new Logger(module)

// 1e12 wei, i.e. one millionth of one DATA token (we can tweak this later if needed)
const MIN_SPONSORSHIP_TOTAL_PAYOUT_PER_SECOND = 1000000000000n

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
    amount: WeiAmount
) => Promise<void> => {
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
        scheduleAtApproximateInterval(async () => {
            try {
                await this.runActions(streamrClient, minStakePerSponsorship)
            } catch (err) {
                logger.warn('Error while running autostaker actions', { err })
            }
        }, this.pluginConfig.runIntervalInMs, 0.1, false, this.abortController.signal)
    }

    private async runActions(streamrClient: StreamrClient, minStakePerSponsorship: bigint): Promise<void> {
        logger.info('Run autostaker analysis')
        const provider = (await streamrClient.getSigner()).provider
        const operatorContract = _operatorContractUtils.getOperatorContract(this.pluginConfig.operatorContractAddress)
            .connect(provider)
        const myCurrentStakes = await this.getMyCurrentStakes(streamrClient)
        const stakeableSponsorships = await this.getStakeableSponsorships(myCurrentStakes, streamrClient)
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
            balance: {
                unstaked: formatEther(myUnstakedAmount),
                staked: formatEther(myStakedAmount)
            }
        })
        const actions = adjustStakes({
            myCurrentStakes,
            myUnstakedAmount,
            stakeableSponsorships,
            operatorContractAddress: this.pluginConfig.operatorContractAddress,
            maxSponsorshipCount: this.pluginConfig.maxSponsorshipCount,
            minTransactionAmount: parseEther(String(this.pluginConfig.minTransactionDataTokenAmount)),
            minStakePerSponsorship
        })
        const signer = await streamrClient.getSigner()
        for (const action of actions) {
            logger.info(`Execute action: ${action.type} ${formatEther(action.amount)} ${action.sponsorshipId}`)
            await getStakeOrUnstakeFunction(action)(signer,
                this.pluginConfig.operatorContractAddress,
                action.sponsorshipId,
                action.amount
            )
        }
    }

    private async getStakeableSponsorships(
        stakes: Map<SponsorshipID, WeiAmount>,
        streamrClient: StreamrClient
    ): Promise<Map<SponsorshipID, SponsorshipConfig>> {
        const queryResult = streamrClient.getTheGraphClient().queryEntities<SponsorshipQueryResultItem>((lastId: string, pageSize: number) => {
            // TODO add support spnsorships which have non-zero minimumStakingPeriodSeconds (i.e. implement some loggic in the 
            // payoutPropotionalStrategy so that we ensure that unstaking doesn't happen too soon)
            return {
                query: `
                    {
                        sponsorships (
                            where:  {
                                projectedInsolvency_gt: ${Math.floor(Date.now() / 1000)}
                                minimumStakingPeriodSeconds: "0"
                                minOperators_lte: ${this.pluginConfig.maxAcceptableMinOperatorCount}
                                totalPayoutWeiPerSec_gte: "${MIN_SPONSORSHIP_TOTAL_PAYOUT_PER_SECOND.toString()}"
                                id_gt: "${lastId}"
                            },
                            first: ${pageSize}
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
        const queryResult = streamrClient.getTheGraphClient().queryEntities<StakeQueryResultItem>((lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        stakes (
                            where:  {
                                operator: "${this.pluginConfig.operatorContractAddress.toLowerCase()}",
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

    async stop(): Promise<void> {
        logger.info('Stop autostaker plugin')
        this.abortController.abort()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
