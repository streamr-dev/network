import { Operator } from '@streamr/sdk'
import { Logger, multiplyWeiAmount } from '@streamr/utils'

const logger = new Logger(module)

export const maintainOperatorValue = async (
    withdrawLimitSafetyFraction: number,
    minSponsorshipEarningsInWithdraw: number,
    maxSponsorshipsInWithdraw: number,
    myOperator: Operator
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await myOperator.getEarnings(
        minSponsorshipEarningsInWithdraw,
        maxSponsorshipsInWithdraw
    )
    const triggerWithdrawLimitDataWei = multiplyWeiAmount(maxAllowedEarningsDataWei, 1 - withdrawLimitSafetyFraction)
    logger.trace(` -> is ${sumDataWei} > ${triggerWithdrawLimitDataWei} ?`)
    if (sumDataWei > triggerWithdrawLimitDataWei) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await myOperator.withdrawEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
