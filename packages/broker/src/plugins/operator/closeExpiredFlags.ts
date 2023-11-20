import { EthereumAddress, Logger } from '@streamr/utils'
import { ContractFacade, SponsorshipResult } from './ContractFacade'

const logger = new Logger(module)

export const closeExpiredFlags = async (
    maxFlagAgeSec: number,
    operatorContractAddress: EthereumAddress,
    contractFacade: ContractFacade
): Promise<void> => {
    logger.info('Start')

    const sponsorships = (await contractFacade.getSponsorshipsOfOperator(operatorContractAddress))
        .map((sponsorship: SponsorshipResult) => sponsorship.sponsorshipAddress)
    logger.debug(`Found ${sponsorships.length} sponsorships`)
    if (sponsorships.length === 0) {
        return
    }
    const flags = await contractFacade.getExpiredFlags(sponsorships, maxFlagAgeSec)
    logger.debug(`found ${flags.length} expired flags to close`)
    for (const flag of flags) {
        const operatorAddress = flag.target.id
        const sponsorship = flag.sponsorship.id
        // voteOnFlag is not used to vote here but to close the expired flag. The vote data gets ignored.
        // Anyone can call this function at this point.
        logger.info('Closing expired flag', { flag })
        await contractFacade.voteOnFlag(sponsorship, operatorAddress, false)
    }
}
