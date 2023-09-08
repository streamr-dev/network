import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 // 1 hour

export class OperatorPoolValueBreachWatcher {
    private driftLimitFractionCached?: bigint
    private readonly abortController: AbortController

    // public access modifier for tests
    readonly helper: MaintainOperatorPoolValueHelper

    constructor(config: OperatorServiceConfig) {
        this.helper = new MaintainOperatorPoolValueHelper(config)
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        await scheduleAtInterval(
            () => this.checkRandomUnwithdrawnEarnings().catch((err) => {
                logger.warn('Encountered error', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    private async checkRandomUnwithdrawnEarnings(): Promise<void> {
        const randomOperatorAddress = await this.helper.getRandomOperator()
        if (randomOperatorAddress === undefined) {
            logger.info('No operators found')
            return
        }
        logger.info('Check unwithdrawn earnings', { randomOperatorAddress })
        await this.checkUnwithdrawnEarningsOf(randomOperatorAddress)
    }

    private async checkUnwithdrawnEarningsOf(targetOperatorAddress: EthereumAddress): Promise<void> {
        const { sumDataWei, rewardThresholdDataWei, sponsorshipAddresses } = await this.helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
        logger.trace(` -> is ${sumDataWei} > ${rewardThresholdDataWei}?`)
        if (sumDataWei > rewardThresholdDataWei) {
            logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
                { targetOperatorAddress, sponsorshipAddresses, sumDataWei, rewardThresholdDataWei })
            await this.helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
        }
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
