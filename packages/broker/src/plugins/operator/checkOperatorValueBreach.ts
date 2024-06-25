import { Operator } from '@streamr/sdk'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    operator: Operator,
    minSponsorshipEarningsInWithdraw: number,
    maxSponsorshipsInWithdraw: number
): Promise<void> => {
    const targetOperatorAddress = await operator.getRandomOperator()
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check other operator\'s earnings for breach', { targetOperatorAddress })
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await operator.getEarningsOf(
        targetOperatorAddress,
        minSponsorshipEarningsInWithdraw,
        maxSponsorshipsInWithdraw
    )
    logger.trace(` -> is ${sumDataWei} > ${maxAllowedEarningsDataWei}?`)
    if (sumDataWei > maxAllowedEarningsDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, sumDataWei, maxAllowedEarningsDataWei })
        await operator.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
