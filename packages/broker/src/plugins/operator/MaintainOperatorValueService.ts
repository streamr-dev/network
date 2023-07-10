import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day

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

    async start(): Promise<void> {
        this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()

        await scheduleAtInterval(
            () => this.checkValue().catch((err) => {
                logger.warn('Encountered error while checking value', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    private async checkValue(): Promise<void> {
        logger.info('Check earnings and withdraw them if they are above the allowed amount')
        const safeUnwithdrawnEarningsFraction = this.penaltyLimitFraction! * this.withdrawLimitSafetyFraction / BigInt(1e18)
        await this.helper.checkAndWithdrawEarningsFromSponsorships(safeUnwithdrawnEarningsFraction)
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
