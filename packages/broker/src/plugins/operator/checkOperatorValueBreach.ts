import { Logger } from '@streamr/utils'
import { ContractFacade } from './ContractFacade'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    contractFacade: ContractFacade
): Promise<void> => {
    const targetOperatorAddress = await contractFacade.getRandomOperator()
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check earnings', { targetOperatorAddress })
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await contractFacade.getEarningsOf(targetOperatorAddress)
    logger.trace(` -> is ${sumDataWei} > ${maxAllowedEarningsDataWei}?`)
    if (sumDataWei > maxAllowedEarningsDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, sumDataWei, maxAllowedEarningsDataWei })
        await contractFacade.triggerWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
