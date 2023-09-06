import { Logger } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'

const logger = new Logger(module)

const ONE_ETHER = 1e18

export const maintainOperatorPoolValue = async (
    withdrawLimitSafetyFraction: bigint,
    driftLimitFraction: bigint,
    helper: MaintainOperatorPoolValueHelper
): Promise<void> => {
    logger.info('Check whether it is time to withdraw my earnings')
    const { fraction, sponsorshipAddresses } = await helper.getMyUnwithdrawnEarnings()
    const safeUnwithdrawnEarningsFraction = driftLimitFraction * withdrawLimitSafetyFraction / BigInt(ONE_ETHER)
    logger.trace(` -> is ${Number(fraction) / ONE_ETHER * 100}% > ${Number(safeUnwithdrawnEarningsFraction) / ONE_ETHER * 100}% ?`)
    if (fraction > safeUnwithdrawnEarningsFraction) {
        logger.info('Withdraw earnings from sponsorships', { sponsorshipAddresses })
        await helper.withdrawEarningsFromSponsorshipsToOperatorContract(sponsorshipAddresses)
    } else {
        logger.info('Skip withdrawing earnings', { fraction, safeUnwithdrawnEarningsFraction })
    }
}