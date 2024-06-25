import { Operator } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { multiply } from '../../helpers/multiply'

const logger = new Logger(module)

export const maintainOperatorValue = async (
    withdrawLimitSafetyFraction: number,
    minSponsorshipEarningsInWithdraw: number,
    maxSponsorshipsInWithdraw: number,
    operator: Operator
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await operator.getMyEarnings(
        minSponsorshipEarningsInWithdraw,
        maxSponsorshipsInWithdraw
    )
    const triggerWithdrawLimitDataWei = multiply(maxAllowedEarningsDataWei, 1 - withdrawLimitSafetyFraction)
    logger.trace(` -> is ${sumDataWei} > ${triggerWithdrawLimitDataWei} ?`)
    if (sumDataWei > triggerWithdrawLimitDataWei) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await operator.withdrawMyEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
