import { Logger } from '@streamr/utils'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'
import { multiply } from '../../helpers/multiply'

const logger = new Logger(module)

export const maintainOperatorValue = async (
    withdrawLimitSafetyFraction: number,
    helper: MaintainOperatorValueHelper
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sumDataWei, rewardThresholdDataWei, sponsorshipAddresses } = await helper.getMyEarnings()
    const triggerWithdrawLimitDataWei = multiply(rewardThresholdDataWei, 1 - withdrawLimitSafetyFraction)
    logger.trace(` -> is ${sumDataWei} > ${triggerWithdrawLimitDataWei} ?`)
    if (sumDataWei > triggerWithdrawLimitDataWei) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await helper.withdrawMyEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
