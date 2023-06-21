import { Logger } from '@streamr/utils'
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"
import { OperatorServiceConfig } from './OperatorPlugin'
import { BigNumber } from 'ethers'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day

export class MaintainOperatorValueService {
    private readonly config: OperatorServiceConfig
    private checkValueInterval: NodeJS.Timeout | null = null
    private readonly helper: MaintainOperatorValueHelper

    constructor(config: OperatorServiceConfig) {
        this.config = config
        this.helper = new MaintainOperatorValueHelper(config)
    }

    start(penaltyLimitFraction?: bigint): void {
        logger.info('Started')
        this.checkValue(penaltyLimitFraction)
        this.checkValueInterval = setInterval(() => {
            this.checkValue(penaltyLimitFraction)
        }, CHECK_VALUE_INTERVAL)
    }

    private async checkValue(penaltyLimitFraction?: bigint): Promise<void> {
        logger.info('Check approximate value for operator', { operatorContractAddress: this.config.operatorContractAddress })

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

        if (penaltyLimitFraction === undefined) {
            penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()
        }

        const threshold = totalApprox * penaltyLimitFraction / BigInt(1e18)
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
            logger.info('Updating sponsorships', { neededSponsorshipsCount, threshold, diffPercentage: diff / totalDiff })
            await this.helper.updateApproximatePoolvalueOfSponsorships(neededSponsorshipAddresses)
            logger.info('Updated sponsorships!')
        }
    }

    async stop(): Promise<void> {
        logger.info('MaintainOperatorValueService stopped')
        clearInterval(this.checkValueInterval!)
    }
}
