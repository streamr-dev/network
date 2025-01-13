import { StreamrClient, Operator } from '@streamr/sdk'
import { EthereumAddress, Logger, WeiAmount } from '@streamr/utils'
import { sample, without } from 'lodash'

const logger = new Logger(module)

export const checkOperatorValueBreach = async (
    myOperator: Operator,
    client: StreamrClient,
    getStakedOperators: () => Promise<EthereumAddress[]>,
    minSponsorshipEarningsInWithdraw: WeiAmount,
    maxSponsorshipsInWithdraw: number
): Promise<void> => {
    const targetOperatorAddress = sample(without(await getStakedOperators(), await myOperator.getContractAddress()))
    if (targetOperatorAddress === undefined) {
        logger.info('No operators found')
        return
    }
    logger.info("Check other operator's earnings for breach", { targetOperatorAddress })
    const { sum, maxAllowedEarnings, sponsorshipAddresses } = await client
        .getOperator(targetOperatorAddress)
        .getEarnings(minSponsorshipEarningsInWithdraw, maxSponsorshipsInWithdraw)
    logger.trace(` -> is ${sum} > ${maxAllowedEarnings}?`)
    if (sum > maxAllowedEarnings) {
        logger.info('Withdraw earnings from sponsorships (target operator value in breach)', {
            targetOperatorAddress,
            sponsorshipAddresses,
            sum: sum.toString(),
            maxAllowedEarnings: maxAllowedEarnings.toString()
        })
        await myOperator.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)
    }
}
