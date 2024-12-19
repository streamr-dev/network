import { StreamrClient, Operator } from '@streamr/sdk'
import { EthereumAddress, Logger } from '@streamr/utils'
import { formatUnits } from 'ethers'
import { sample, without } from 'lodash'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    myOperator: Operator,
    client: StreamrClient,
    getStakedOperators: () => Promise<EthereumAddress[]>,
    minSponsorshipEarningsInWithdrawWei: bigint,
    maxSponsorshipsInWithdraw: number
): Promise<void> => {
    const targetOperatorAddress = sample(without(await getStakedOperators(), await myOperator.getContractAddress()))
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info('Check other operator\'s earnings for breach', { targetOperatorAddress })
    const { sumDataWei, maxAllowedEarningsDataWei, sponsorshipAddresses } = await client.getOperator(targetOperatorAddress).getEarnings(
        minSponsorshipEarningsInWithdrawWei,
        maxSponsorshipsInWithdraw
    )
    logger.trace(` -> is ${sumDataWei} > ${maxAllowedEarningsDataWei}?`)
    if (sumDataWei > maxAllowedEarningsDataWei) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)',
            {
                targetOperatorAddress,
                sponsorshipAddresses,
                sumDataWei: formatUnits(sumDataWei, 'wei'),
                maxAllowedEarningsDataWei: formatUnits(maxAllowedEarningsDataWei, 'wei')
            })
        await myOperator.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
