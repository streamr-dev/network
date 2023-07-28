import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL_MS = 1000 * 60 * 60 * 24 // 1 day

export class MaintainOperatorValueService {
    private readonly withdrawLimitSafetyFraction: bigint
    private penaltyLimitFraction?: bigint
    private readonly helper: MaintainOperatorValueHelper
    private readonly abortController: AbortController

    constructor(config: OperatorServiceConfig, withdrawLimitSafetyFraction = 0.5) {
        this.withdrawLimitSafetyFraction = BigInt(withdrawLimitSafetyFraction * 1e18)
        this.helper = new MaintainOperatorValueHelper(config)
        this.abortController = new AbortController()
    }

    async checkMyUnwithdrawnEarnings(): Promise<void> {
        logger.info('Check unwithdrawn earnings and check if they are above the safe threshold')
        const { fraction, sponsorshipAddresses } = await this.helper.getMyUnwithdrawnEarnings()
        const safeUnwithdrawnEarningsFraction = this.penaltyLimitFraction! * this.withdrawLimitSafetyFraction / BigInt(1e18)
        logger.info(` -> is ${fraction} > ${safeUnwithdrawnEarningsFraction}?`)
        if (fraction > safeUnwithdrawnEarningsFraction) {
            logger.info("Withdrawing earnings from sponsorships", { sponsorshipAddresses })
            await this.helper.withdrawEarningsFromSponsorships(sponsorshipAddresses)
        }
    }

    async start(): Promise<void> {
        this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()

        await scheduleAtInterval(
            () => this.checkMyUnwithdrawnEarnings().catch((err) => {
                logger.warn('Encountered error during checkUnwithdrawnEarnings', { err })
            }),
            CHECK_VALUE_INTERVAL_MS,
            true,
            this.abortController.signal
        )
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
