import { StreamrClient, Operator } from '@streamr/sdk'
import { EthereumAddress, Logger } from '@streamr/utils'
import { sample, without } from 'lodash'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    myOperator: Operator,
    client: StreamrClient,
    getStakedOperators: () => Promise<EthereumAddress[]>,
    minSponsorshipEarningsInWithdraw: number,
    maxSponsorshipsInWithdraw: number
): Promise<void> => {
    const targetOperatorAddress = sample(without(await getStakedOperators(), await myOperator.getContractAddress()))
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check other operator\'s earnings for breach', { targetOperatorAddress })
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await client.getOperator(targetOperatorAddress).getEarnings(
        minSponsorshipEarningsInWithdraw,
        maxSponsorshipsInWithdraw
    )
    logger.trace(` -> is ${sumDataWei} > ${maxAllowedEarningsDataWei}?`)
    if (sumDataWei > maxAllowedEarningsDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            { targetOperatorAddress, sponsorshipAddresses, sumDataWei, maxAllowedEarningsDataWei })
        await myOperator.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
