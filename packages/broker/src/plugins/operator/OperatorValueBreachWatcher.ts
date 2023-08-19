import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 // 1 hour

export class OperatorValueBreachWatcher {
    private penaltyLimitFractionCached?: bigint
    private readonly abortController: AbortController
    
    // public access modifier for tests 
    readonly helper: MaintainOperatorValueHelper

    constructor(config: OperatorServiceConfig) {
        this.helper = new MaintainOperatorValueHelper(config)
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
        return this.checkUnwithdrawnEarningsOf(randomOperatorAddress)
    }

    private async checkUnwithdrawnEarningsOf(targetOperatorAddress: EthereumAddress): Promise<void> {
        const { fraction, sponsorshipAddresses } = await this.helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
        const limit = await this.getPenaltyLimitFraction()
        logger.trace(` -> is ${fraction} > ${limit}?`)
        if (fraction > limit) {
            logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
            await this.helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
        }
    }

    async getPenaltyLimitFraction(): Promise<bigint> {
        if (!this.penaltyLimitFractionCached) {
            this.penaltyLimitFractionCached = await this.helper.getPenaltyLimitFraction()
        }
        return this.penaltyLimitFractionCached
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
