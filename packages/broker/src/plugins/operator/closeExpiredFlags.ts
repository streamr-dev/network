import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { Sponsorship, sponsorshipABI } from '@streamr/network-contracts'
import { Contract } from '@ethersproject/contracts'
import { randomBytes } from '@ethersproject/random'
import { ContractFacade, SponsorshipResult } from './ContractFacade'
import { OperatorServiceConfig } from './OperatorPlugin'
import { log } from 'console'

const logger = new Logger(module)

export const closeExpiredFlags = async (
    flagLifetime: number,
    operatorContractAddress: EthereumAddress,
    contractFacade: ContractFacade
): Promise<void> => {
    logger.info('running closeExpiredFlags')

    const minFlagStartTime = Math.floor(Date.now() / 1000) - flagLifetime

    const sponsorships = (await contractFacade.getSponsorshipsOfOperator(operatorContractAddress))
        .map((sponsorship: SponsorshipResult) => sponsorship.sponsorshipAddress)
    if (sponsorships.length === 0) {
        logger.info('no sponsorships found')
        return
    }
    logger.info(`found ${sponsorships.length} sponsorships`)
    const flags = await contractFacade.getExpiredRelevantFlags(sponsorships, flagLifetime)
    logger.info(`found ${flags.length} flags`)
    for (const flag of flags) {
        const operatorAddress = flag.target.id
        const sponsorship = flag.sponsorship.id
        if (flag.flaggingTimestamp < minFlagStartTime) {
            // voteOnFlag calls on expired flags will close the flag, ignoring the vote data
            // also anyone can clal this function
            await contractFacade.voteOnFlag(sponsorship, operatorAddress, false)
        }
    }
}
