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
        const { fraction, sponsorshipAddresses } = await this.helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
        const limit = await this.getDriftLimitFraction()
        logger.trace(` -> is ${fraction} > ${limit}?`)
        if (fraction > limit) {
            logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
                { targetOperatorAddress, sponsorshipAddresses, fraction, limit })
            await this.helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
        }
    }

    private async getDriftLimitFraction(): Promise<bigint> {
        if (this.driftLimitFractionCached === undefined) {
            this.driftLimitFractionCached = await this.helper.getDriftLimitFraction()
        }
        return this.driftLimitFractionCached
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
