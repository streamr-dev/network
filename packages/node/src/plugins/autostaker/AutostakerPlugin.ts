import { _operatorContractUtils, SignerWithProvider, StreamrClient } from '@streamr/sdk'
import { collect, Logger, scheduleAtInterval, WeiAmount } from '@streamr/utils'
import { Schema } from 'ajv'
import { formatEther, parseEther, Wallet } from 'ethers'
import sample from 'lodash/sample'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface AutostakerPluginConfig {
    operatorContractAddress: string
    // TODO is it possible implement this without exposing the private key here?
    // e.g. by configuring so that operator nodes can stake behalf of the operator?
    operatorOwnerPrivateKey: string
    runIntervalInMs: number
}

const STAKE_AMOUNT: WeiAmount = parseEther('10000')

const logger = new Logger(module)

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
        const stakedAmount = await operatorContract.totalStakedIntoSponsorshipsWei()
        const availableBalance = (await operatorContract.valueWithoutEarnings()) - stakedAmount
        logger.info(`Available balance: ${formatEther(availableBalance)} (staked=${formatEther(stakedAmount)})`)
        // TODO is there a better way to get the client? Maybe we should add StreamrClient#getTheGraphClient()
        // TODO what are good where consitions for the sponsorships query
        // @ts-expect-error private
        const queryResult = streamrClient.theGraphClient.queryEntities((lastId: string, pageSize: number) => {
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
                        }
                    }
                `
            }
        })
        const sponsorships: { id: string }[] = await collect(queryResult)
        logger.info(`Available sponsorships: ${sponsorships.map((s) => s.id).join(',')}`)
        if ((sponsorships.length) > 0 && (availableBalance >= STAKE_AMOUNT)) {
            const targetSponsorship = sample(sponsorships)!
            logger.info(`Stake ${formatEther(STAKE_AMOUNT)} to ${targetSponsorship.id}`)
            await _operatorContractUtils.stake(
                new Wallet(this.pluginConfig.operatorOwnerPrivateKey, provider) as SignerWithProvider,
                this.pluginConfig.operatorContractAddress,
                targetSponsorship.id,
                STAKE_AMOUNT
            )
        }
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
