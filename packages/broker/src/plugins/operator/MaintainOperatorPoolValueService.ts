import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const ONE_ETHER = 1e18

export class MaintainOperatorPoolValueService {
    private readonly withdrawLimitSafetyFraction: bigint
    private driftLimitFraction?: bigint
    private readonly helper: MaintainOperatorPoolValueHelper
    private readonly abortController: AbortController
    private readonly checkIntervalInMs: number

    constructor(
        config: OperatorServiceConfig,
        withdrawLimitSafetyFraction: number,
        checkValueIntervalMs: number
    ) {
        this.withdrawLimitSafetyFraction = BigInt(withdrawLimitSafetyFraction * ONE_ETHER)
        this.helper = new MaintainOperatorPoolValueHelper(config)
        this.abortController = new AbortController()
        this.checkIntervalInMs = checkValueIntervalMs
    }

    async start(): Promise<void> {
        this.driftLimitFraction = await this.helper.getDriftLimitFraction()

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
        const safeUnwithdrawnEarningsFraction = this.driftLimitFraction! * this.withdrawLimitSafetyFraction / BigInt(ONE_ETHER)
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
