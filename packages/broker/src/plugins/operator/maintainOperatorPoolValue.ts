import { Logger } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'

const logger = new Logger(module)

export const maintainOperatorPoolValue = async (
    withdrawLimitSafetyFraction: number,
    helper: MaintainOperatorPoolValueHelper
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sumDataWei, rewardThresholdDataWei, sponsorshipAddresses } = await helper.getMyUnwithdrawnEarnings()
    const triggerWithdrawLimitDataWei = rewardThresholdDataWei * BigInt(1e18 * (1 - withdrawLimitSafetyFraction)) / BigInt(1e18)
    logger.trace(` -> is ${sumDataWei} > ${triggerWithdrawLimitDataWei} ?`)
    if (sumDataWei > triggerWithdrawLimitDataWei) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await helper.withdrawMyEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
