import { formatEther } from 'ethers/lib/utils'
import { Operator } from '@streamr/network-contracts'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export async function getTotalUnwithdrawnEarnings(operatorContract: Operator): Promise<bigint> {
    const { earnings } = await operatorContract.getEarningsFromSponsorships()
    let unwithdrawnEarnings = BigInt(0)
    for (const e of earnings) {
        unwithdrawnEarnings += e.toBigInt()
    }
    logger.debug(`Total unwithdrawn earnings: ${formatEther(unwithdrawnEarnings.toString())}`)
    return unwithdrawnEarnings
}
