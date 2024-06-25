import { Operator, SponsorshipResult } from '@streamr/sdk'
import { EthereumAddress, Logger } from '@streamr/utils'

const logger = new Logger(module)

export const closeExpiredFlags = async (
    maxAgeInMs: number,
    operatorContractAddress: EthereumAddress,
    operator: Operator
): Promise<void> => {
    logger.info('Start')

    const sponsorships = (await operator.getSponsorshipsOfOperator(operatorContractAddress))
        .map((sponsorship: SponsorshipResult) => sponsorship.sponsorshipAddress)
    logger.debug(`Found ${sponsorships.length} sponsorships`)
    if (sponsorships.length === 0) {
        return
    }
    const flags = await operator.getExpiredFlags(sponsorships, maxAgeInMs)
    logger.debug(`Found ${flags.length} expired flags to close`)
    for (const flag of flags) {
        const operatorAddress = flag.target.id
        const sponsorship = flag.sponsorship.id
        logger.info('Close expired flag', { flag })
        await operator.closeFlag(sponsorship, operatorAddress)
    }
}
