import { _operatorContractUtils, SignerWithProvider, StreamrClient } from '@streamr/sdk'
import { collect, Logger, scheduleAtApproximateInterval, TheGraphClient, WeiAmount } from '@streamr/utils'
import { Schema } from 'ajv'
import { formatEther, parseEther } from 'ethers'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { adjustStakes } from './payoutProportionalStrategy'
import { Action, SponsorshipConfig, SponsorshipID } from './types'

export interface AutostakerPluginConfig {
    operatorContractAddress: string
    runIntervalInMs: number
    minTransactionDataTokenAmount: number
    maxSponsorshipCount?: number
}

interface SponsorshipQueryResultItem {
    id: SponsorshipID
    totalPayoutWeiPerSec: WeiAmount
}

interface StakeQueryResultItem {
    id: string
    sponsorship: {
        id: SponsorshipID
    }
    amountWei: WeiAmount
}

const logger = new Logger(module)

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
        const stakeableSponsorships = await this.getStakeableSponsorships(streamrClient)
        const stakes = await this.getStakes(streamrClient)
        const stakedAmount = await operatorContract.totalStakedIntoSponsorshipsWei()
        const unstakedAmount = (await operatorContract.valueWithoutEarnings()) - stakedAmount
        logger.debug('Analysis state', {
            stakeableSponsorships: [...stakeableSponsorships.entries()].map(([sponsorshipId, config]) => ({
                sponsorshipId,
                payoutPerSec: formatEther(config.payoutPerSec)
            })),
            stakes: [...stakes.entries()].map(([sponsorshipId, amount]) => ({
                sponsorshipId,
                amount: formatEther(amount)
            })),
            balance: {
                unstaked: formatEther(unstakedAmount),
                staked: formatEther(stakedAmount)
            }
        })
        const actions = adjustStakes({
            operatorState: {
                stakes,
                unstakedAmount
            },
            operatorConfig: {
                operatorContractAddress: this.pluginConfig.operatorContractAddress,
                minTransactionAmount: parseEther(String(this.pluginConfig.minTransactionDataTokenAmount)),
                maxSponsorshipCount: this.pluginConfig.maxSponsorshipCount
            },
            stakeableSponsorships,
            environmentConfig: {
                minStakePerSponsorship
            }
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

    // eslint-disable-next-line class-methods-use-this
    private async getStakeableSponsorships(streamrClient: StreamrClient): Promise<Map<SponsorshipID, SponsorshipConfig>> {
        const queryResult = streamrClient.getTheGraphClient().queryEntities<SponsorshipQueryResultItem>((lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        sponsorships (
                            where:  {
                                projectedInsolvency_gt: ${Math.floor(Date.now() / 1000)}
                                id_gt: "${lastId}"
                            },
                            first: ${pageSize}
                        ) {
                            id
                            totalPayoutWeiPerSec
                        }
                    }
                `
            }
        })
        const sponsorships = await collect(queryResult)
        return new Map(sponsorships.map(
            (sponsorship) => [sponsorship.id, {
                payoutPerSec: BigInt(sponsorship.totalPayoutWeiPerSec),
            }])
        )
    }

    private async getStakes(streamrClient: StreamrClient): Promise<Map<SponsorshipID, WeiAmount>> {
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
