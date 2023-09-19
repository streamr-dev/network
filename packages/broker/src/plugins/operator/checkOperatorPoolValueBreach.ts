import { Logger } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'

const logger = new Logger(module)

export const checkOperatorPoolValueBreach = async (
    helper: MaintainOperatorPoolValueHelper
): Promise<void> => {
    const targetOperatorAddress = await helper.getRandomOperator()
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check unwithdrawn earnings', { targetOperatorAddress })
    const { sumDataWei, rewardThresholdDataWei, sponsorshipAddresses } = await helper.getUnwithdrawnEarningsOf(targetOperatorAddress)
    logger.trace(` -> is ${sumDataWei} > ${rewardThresholdDataWei}?`)
    if (sumDataWei > rewardThresholdDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, sumDataWei, rewardThresholdDataWei })
        await helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
