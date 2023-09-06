import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const DEFAULT_CHECK_VALUE_INTERVAL_MS = 1000 * 60 * 60 * 24 // 1 day
const DEFAULT_WITHDRAW_LIMIT_SAFETY_FRACTION = 0.5 // 50%
const ONE_ETHER = 1e18

export class MaintainOperatorPoolValueService {
    private readonly withdrawLimitSafetyFraction: bigint
    private penaltyLimitFraction?: bigint
    private readonly helper: MaintainOperatorPoolValueHelper
    private readonly abortController: AbortController
    private readonly checkIntervalInMs: number

    constructor(
        config: OperatorServiceConfig,
        withdrawLimitSafetyFraction = DEFAULT_WITHDRAW_LIMIT_SAFETY_FRACTION,
        checkValueIntervalMs = DEFAULT_CHECK_VALUE_INTERVAL_MS
    ) {
        this.withdrawLimitSafetyFraction = BigInt(withdrawLimitSafetyFraction * ONE_ETHER)
        this.helper = new MaintainOperatorPoolValueHelper(config)
        this.abortController = new AbortController()
        this.checkIntervalInMs = checkValueIntervalMs
    }

    async start(): Promise<void> {
        this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()

        await scheduleAtInterval(
            () => this.checkMyUnwithdrawnEarnings().catch((err) => {
                logger.error('Encountered error while checking unwithdrawn earnings', { err })
            }),
            this.checkIntervalInMs,
            true,
            this.abortController.signal
        )
    }

    private async checkMyUnwithdrawnEarnings(): Promise<void> {
        logger.info('Check whether it is time to withdraw my earnings')
        const { fraction, sponsorshipAddresses } = await this.helper.getMyUnwithdrawnEarnings()
        const safeUnwithdrawnEarningsFraction = this.penaltyLimitFraction! * this.withdrawLimitSafetyFraction / BigInt(ONE_ETHER)
        logger.trace(` -> is ${Number(fraction) / ONE_ETHER * 100}% > ${Number(safeUnwithdrawnEarningsFraction) / ONE_ETHER * 100}% ?`)
        if (fraction > safeUnwithdrawnEarningsFraction) {
            logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
            await this.helper.withdrawMyEarningsFromSponsorships(sponsorshipAddresses)
        } else {
            logger.info('Skip withdrawing earnings', { fraction, safeUnwithdrawnEarningsFraction })
        }
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
