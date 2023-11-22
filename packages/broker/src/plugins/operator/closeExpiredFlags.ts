import { EthereumAddress, Logger } from '@streamr/utils'
import { ContractFacade, SponsorshipResult } from './ContractFacade'

const logger = new Logger(module)

export const closeExpiredFlags = async (
    maxAgeInMs: number,
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
    const flags = await contractFacade.getExpiredFlags(sponsorships, maxAgeInMs)
    logger.debug(`Found ${flags.length} expired flags to close`)
    for (const flag of flags) {
        const operatorAddress = flag.target.id
        const sponsorship = flag.sponsorship.id
        logger.info('Close expired flag', { flag })
        await contractFacade.closeFlag(sponsorship, operatorAddress)
    }
}
