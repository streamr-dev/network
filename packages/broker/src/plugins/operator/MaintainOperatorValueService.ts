import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day
const ONE_ETHER = BigInt(1e18)

export class MaintainOperatorValueService {
    private penaltyLimitFraction: bigint
    private operatorsShareFraction = BigInt(0)
    private readonly helper: MaintainOperatorValueHelper
    private readonly abortController: AbortController

    constructor(config: OperatorServiceConfig, penaltyLimitFraction = BigInt(0)) {
        this.penaltyLimitFraction = penaltyLimitFraction
        this.helper = new MaintainOperatorValueHelper(config)
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        this.operatorsShareFraction = await this.helper.getOperatorsShareFraction()
        await scheduleAtInterval(
            () => this.checkValue().catch((err) => {
                logger.warn('Encountered error while checking value', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    private async checkValue(): Promise<void> {
        const { sponsorshipAddresses, earnings } = await this.helper.getEarningsFromSponsorships()

        let totalEarnings = BigInt(0)
        const sponsorships: { address: string, earnings: bigint }[] = []
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            const sponsorship = {
                address: sponsorshipAddresses[i],
                earnings: earnings[i].toBigInt(),
            }
            sponsorships.push(sponsorship)
            totalEarnings = totalEarnings + sponsorship.earnings
        }
       
        if (this.penaltyLimitFraction === BigInt(0)) {
            this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()
        }

        const operatorsShare = (totalEarnings + this.operatorsShareFraction) / ONE_ETHER
        const approxPoolValueBeforeWithdraw = await this.helper.getApproximatePoolValue()
        const allowedDiff = approxPoolValueBeforeWithdraw * this.penaltyLimitFraction / ONE_ETHER
         
        logger.info('Check approximate pool values of sponsorships', { diff: totalEarnings - operatorsShare, allowedDiff })
        if (totalEarnings - operatorsShare > allowedDiff) { // TODO: should NOT subtract operatorsShare here
            // sort sponsorships by earnings in descending order
            const sortedSponsorships = sponsorships.sort((a: any, b: any) => b.earnings - a.earnings)

            // find the number of sponsorships needed to get the total diff under the threshold
            // TODO: handle milking problem (needed count here is min to get below the threshold)
            const threshold = totalEarnings + operatorsShare - allowedDiff
            let neededSponsorshipsCount = 0
            let sumEarnings = BigInt(0)
            for (const sponsorship of sortedSponsorships) {
                sumEarnings = sumEarnings + sponsorship.earnings
                neededSponsorshipsCount += 1
                if (sumEarnings > threshold) {
                    break
                }
            }
            
            logger.info('Withdraw earnings from sponsorships', { sumEarnings, threshold, unwithdrawnEarnings: totalEarnings - sumEarnings })
            // pick the first entries needed to get the total earnings under the allowed difference
            const neededSponsorshipAddresses = sortedSponsorships.slice(0, neededSponsorshipsCount).map((sponsorship) => sponsorship.address)
            await this.helper.withdrawEarningsFromSponsorships(neededSponsorshipAddresses)
        }
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
