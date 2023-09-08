import { Logger } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'

const logger = new Logger(module)

export const checkOperatorPoolValueBreach = async (
    driftLimitFraction: bigint,
    helper: MaintainOperatorPoolValueHelper
): Promise<void> => {
    const targetOperatorAddress = await helper.getRandomOperator()
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check unwithdrawn earnings', { targetOperatorAddress })
    const { fraction, sponsorshipAddresses } = await helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
    logger.trace(` -> is ${fraction} > ${driftLimitFraction}?`)
    if (fraction > driftLimitFraction) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, fraction, driftLimitFraction })
        await helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
