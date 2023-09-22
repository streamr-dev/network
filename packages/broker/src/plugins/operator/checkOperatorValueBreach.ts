import { Logger } from '@streamr/utils'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    helper: MaintainOperatorValueHelper
): Promise<void> => {
    const targetOperatorAddress = await helper.getRandomOperator()
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check earnings', { targetOperatorAddress })
    const { sumDataWei, rewardThresholdDataWei, sponsorshipAddresses } = await helper.getEarningsOf(targetOperatorAddress)
    logger.trace(` -> is ${sumDataWei} > ${rewardThresholdDataWei}?`)
    if (sumDataWei > rewardThresholdDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, sumDataWei, rewardThresholdDataWei })
        await helper.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
