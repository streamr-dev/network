import { Operator, SponsorshipResult } from '@streamr/sdk'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export const closeExpiredFlags = async (
    maxAgeInMs: number,
    operator: Operator
): Promise<void> => {
    logger.info('Start')

    const sponsorships = (await operator.getSponsorships())
        .map((sponsorship: SponsorshipResult) => sponsorship.sponsorshipAddress)
    logger.debug(`Found ${sponsorships.length} sponsorships`)
    if (sponsorships.length === 0) {
        return
    }
    const flags = await operator.getExpiredFlags(sponsorships, maxAgeInMs)
    logger.debug(`Found ${flags.length} expired flags to close`)
    for (const flag of flags) {
        const operatorAddress = flag.targetOperator
        const sponsorship = flag.sponsorship
        logger.info('Close expired flag', { flag })
        await operator.closeFlag(sponsorship, operatorAddress)
    }
}
