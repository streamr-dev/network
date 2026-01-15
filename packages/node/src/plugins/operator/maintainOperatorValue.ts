import { Operator } from '@streamr/sdk'
import { Logger, multiplyWeiAmount, WeiAmount } from '@streamr/utils'

const logger = new Logger('maintainOperatorValue')

export const maintainOperatorValue = async (
    withdrawLimitSafetyFraction: number,
    minSponsorshipEarningsInWithdraw: WeiAmount,
    maxSponsorshipsInWithdraw: number,
    myOperator: Operator
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sum, maxAllowedEarnings, sponsorshipAddresses } = await myOperator.getEarnings(
        minSponsorshipEarningsInWithdraw,
        maxSponsorshipsInWithdraw
    )
    const triggerWithdrawLimit = multiplyWeiAmount(maxAllowedEarnings, 1 - withdrawLimitSafetyFraction)
    logger.trace(` -> is ${sum} > ${triggerWithdrawLimit} ?`)
    if (sum > triggerWithdrawLimit) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await myOperator.withdrawEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
