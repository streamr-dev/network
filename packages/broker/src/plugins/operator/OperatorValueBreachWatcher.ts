import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 // 1 hour

export class OperatorValueBreachWatcher {
    private penaltyLimitFractionCached?: bigint
    private readonly abortController: AbortController
    
    readonly helper: MaintainOperatorValueHelper

    constructor(config: OperatorServiceConfig) {
        this.helper = new MaintainOperatorValueHelper(config)
        this.abortController = new AbortController()
    }

    async checkRandomUnwithdrawnEarnings(): Promise<void> {
        const randomOperatorAddress = await this.helper.getRandomOperator()
        logger.info("Checking unwithdrawn earnings", { randomOperatorAddress })
        return this.checkUnwithdrawnEarningsOf(randomOperatorAddress)
    }

    async checkUnwithdrawnEarningsOf(targetOperatorAddress: EthereumAddress): Promise<void> {
        logger.info('Check unwithdrawn earnings and check if they are above the safe threshold')
        const { fraction, sponsorshipAddresses } = await this.helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
        const limit = await this.getPenaltyLimitFraction()
        logger.info(` -> is ${fraction} > ${limit}?`)
        if (fraction > limit) {
            logger.info("Withdrawing earnings from sponsorships", { sponsorshipAddresses })
            await this.helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
        }
    }

    async getPenaltyLimitFraction(): Promise<bigint> {
        if (!this.penaltyLimitFractionCached) {
            this.penaltyLimitFractionCached = await this.helper.getPenaltyLimitFraction()
        }
        return this.penaltyLimitFractionCached
    }

    async start(): Promise<void> {
        await scheduleAtInterval(
            () => this.checkRandomUnwithdrawnEarnings().catch((err) => {
                logger.warn('Encountered error while watching operators', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
