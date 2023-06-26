import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"
import { OperatorServiceConfig } from './OperatorPlugin'
import { BigNumber } from 'ethers'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day
const ONE_ETHER = BigInt(1e18)

export class MaintainOperatorValueService {
    private penaltyLimitFraction: bigint
    private readonly helper: MaintainOperatorValueHelper
    private readonly abortController: AbortController

    constructor(config: OperatorServiceConfig, penaltyLimitFraction = BigInt(0)) {
        this.penaltyLimitFraction = penaltyLimitFraction
        this.helper = new MaintainOperatorValueHelper(config)
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
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
        const { sponsorshipAddresses, approxValues, realValues } = await this.helper.getApproximatePoolValuesPerSponsorship()
        let totalDiff = BigInt(0)
        let totalApprox = BigInt(0)
        const sponsorships: { address: string, approxValue: BigNumber, realValue: BigNumber, diff: BigNumber }[] = []
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            const sponsorship = {
                address: sponsorshipAddresses[i],
                approxValue: approxValues[i],
                realValue: realValues[i],
                diff: realValues[i].sub(approxValues[i])
            }
            sponsorships.push(sponsorship)
            totalDiff = totalDiff + sponsorship.diff.toBigInt()
            totalApprox = totalApprox + sponsorship.approxValue.toBigInt()
        }

        if (this.penaltyLimitFraction === BigInt(0)) {
            this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()
        }

        const threshold = totalApprox * this.penaltyLimitFraction / BigInt(ONE_ETHER)

        logger.info('Check approximate pool values of sponsorships', { threshold, totalDiff })
        if (totalDiff > threshold) {
            // sort sponsorships by diff in descending order
            const sortedSponsorships = sponsorships.sort((a: any, b: any) => b.diff - a.diff)

            // find the number of sponsorships needed to get the total diff under the threshold
            let neededSponsorshipsCount = 0
            let diff = BigInt(0)
            for (const sponsorship of sortedSponsorships) {
                diff = diff + sponsorship.diff.toBigInt()
                neededSponsorshipsCount += 1
                if (diff > threshold) {
                    break
                }
            }
            
            // pick the first entries needed to get the total diff under the threshold
            const neededSponsorshipAddresses = sortedSponsorships.slice(0, neededSponsorshipsCount).map((sponsorship) => sponsorship.address)
            logger.info('Update approximate pool values of sponsorships', { threshold, diffPercentage: diff / totalDiff })
            await this.helper.updateApproximatePoolValueOfSponsorships(neededSponsorshipAddresses)
        }
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
