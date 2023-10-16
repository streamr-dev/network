import { Logger } from '@streamr/utils'
import { multiply } from '../../helpers/multiply'
import { ContractFacade } from './ContractFacade'

const logger = new Logger(module)

export const maintainOperatorValue = async (
    withdrawLimitSafetyFraction: number,
    contractFacade: ContractFacade
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await contractFacade.getMyEarnings()
    const triggerWithdrawLimitDataWei = multiply(maxAllowedEarningsDataWei, 1 - withdrawLimitSafetyFraction)
    logger.trace(` -> is ${sumDataWei} > ${triggerWithdrawLimitDataWei} ?`)
    if (sumDataWei > triggerWithdrawLimitDataWei) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await contractFacade.withdrawMyEarningsFromSponsorships(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings')
    }
}
