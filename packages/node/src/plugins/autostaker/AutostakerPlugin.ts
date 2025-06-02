import { _operatorContractUtils, SignerWithProvider, StreamrClient } from '@streamr/sdk'
import { collect, Logger, scheduleAtInterval, WeiAmount } from '@streamr/utils'
import { Schema } from 'ajv'
import { formatEther } from 'ethers'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { adjustStakes } from './payoutProportionalStrategy'
import { Action, SponsorshipId, SponsorshipState } from './types'

export interface AutostakerPluginConfig {
    operatorContractAddress: string
    runIntervalInMs: number
}

interface SponsorshipQueryResultItem {
    id: SponsorshipId
    totalPayoutWeiPerSec: bigint
}

interface StakeQueryResultItem {
    id: string
    sponsorship: {
        id: SponsorshipId
    }
    amountWei: bigint
}

const logger = new Logger(module)

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
        scheduleAtInterval(async () => {
            try {
                await this.runActions(streamrClient)
            } catch (err) {
                logger.warn('Error while running autostaker actions', { err })
            }
        }, this.pluginConfig.runIntervalInMs, false, this.abortController.signal)
    }

    private async runActions(streamrClient: StreamrClient): Promise<void> {
        logger.info('Run autostaker actions')
        const provider = (await streamrClient.getSigner()).provider
        const operatorContract = _operatorContractUtils.getOperatorContract(this.pluginConfig.operatorContractAddress)
            .connect(provider)
        const stakedWei = await operatorContract.totalStakedIntoSponsorshipsWei()
        const unstakedWei = (await operatorContract.valueWithoutEarnings()) - stakedWei
        logger.info(`Balance: unstaked=${formatEther(unstakedWei)}, staked=${formatEther(stakedWei)}`)
        const stakeableSponsorships = await this.getStakeableSponsorships(streamrClient)
        logger.info(`Stakeable sponsorships: ${[...stakeableSponsorships.keys()].join(',')}`)
        const stakes = await this.getStakes(streamrClient)
        const stakeDescription = [...stakes.entries()].map(([sponsorshipId, amountWei]) => `${sponsorshipId}=${formatEther(amountWei)}`).join(', ')
        logger.info(`Stakes before adjustments: ${stakeDescription}`)
        const actions = adjustStakes({
            operatorState: {
                stakes,
                unstakedWei
            },
            operatorConfig: {},  // TODO add maxSponsorshipCount
            stakeableSponsorships,
            environmentConfig: {
                minimumStakeWei: 5000000000000000000000n  // TODO read from The Graph (network.minimumStakeWei)
            }
        })
        const signer = await streamrClient.getSigner()
        for (const action of actions) {
            logger.info(`Action: ${action.type} ${formatEther(action.amount)} ${action.sponsorshipId}`)
            await getStakeOrUnstakeFunction(action)(signer,
                this.pluginConfig.operatorContractAddress,
                action.sponsorshipId,
                action.amount
            )
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private async getStakeableSponsorships(streamrClient: StreamrClient): Promise<Map<SponsorshipId, SponsorshipState>> {
        // TODO is there a better way to get the client? Maybe we should add StreamrClient#getTheGraphClient()
        // TODO what are good where conditions for the sponsorships query so that we get all stakeable sponsorships
        // but no non-stakables (e.g. expired)
        const queryResult = streamrClient.getTheGraphClient().queryEntities<SponsorshipQueryResultItem>((lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        sponsorships(
                            where:  {
                                projectedInsolvency_gt: ${Math.floor(Date.now() / 1000)},
                                spotAPY_gt: 0
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
                totalPayoutWeiPerSec: BigInt(sponsorship.totalPayoutWeiPerSec),
            }])
        )
    }

    private async getStakes(streamrClient: StreamrClient): Promise<Map<SponsorshipId, bigint>> {
        const queryResult = streamrClient.getTheGraphClient().queryEntities<StakeQueryResultItem>((lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        stakes(
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
