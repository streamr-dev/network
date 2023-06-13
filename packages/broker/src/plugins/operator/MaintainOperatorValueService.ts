import { Logger } from '@streamr/utils'
import { OperatorClientConfig } from "./OperatorClient"
import { MaintainOperatorValueHelper } from "./MaintainOperatorValueHelper"

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day

export class MaintainOperatorValueService {
    config: OperatorClientConfig
    private checkValueInterval: NodeJS.Timeout | null = null
    private helper: MaintainOperatorValueHelper

    constructor(config: OperatorClientConfig) {
        logger.trace('MaintainOperatorValueService created')
        this.config = config
        this.helper = new MaintainOperatorValueHelper(config)
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
        logger.info('MaintainOperatorValueService started')
        // TODO: estimate seconds until penalty limit is reached and set interval accordingly
        this.checkValueInterval = setInterval(async () => {
            await this.checkValue(this.config.operatorContractAddress)
        }, CHECK_VALUE_INTERVAL)
    }

    async checkValue(operatorContractAddress: string, threshold?: bigint): Promise<void> {
        logger.info(`checkValue for operator contract ${operatorContractAddress} and threshold ${threshold}`)

        if (!threshold) {
            threshold = await this.helper.getThreshold()
        }

        const { sponsorshipAddresses, approxValues, realValues } = await this.helper.getApproximatePoolValuesPerSponsorship()
        let totalDiff = BigInt(0)
        const sponsorships = []
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            const sponsorship = {
                address: sponsorshipAddresses,
                approxValue: approxValues,
                realValue: realValues,
                diff: realValues[i].sub(approxValues[i])
            }
            sponsorships.push(sponsorship)
            totalDiff = totalDiff + sponsorship.diff.toBigInt()
        }
        logger.info(`totalDiff: ${totalDiff}, threshold: ${threshold}`)

        if (totalDiff >= threshold) {
            // sort sponsorships by diff in descending order
            logger.info(`totalDiff ${totalDiff} is over threshold ${threshold} => sorting sponsorships`)
            const sortedSponsorships = sponsorships.sort((a: any, b: any) => b.diff - a.diff)
            logger.info(`sorted ${sortedSponsorships.length} sponsorships`)

            // find the number of sponsorships needed to get the total diff under the threshold
            let neededSponsorshipsCount = 0
            let total = BigInt(0)
            for (const sponsorship of sortedSponsorships) {
                total = total + sponsorship.diff.toBigInt()
                neededSponsorshipsCount += 1
                if (total > threshold) {
                    break
                }
            }
            logger.info(`Needed ${neededSponsorshipsCount} sponsorships to get total diff under threshold with a total of ${total}`)
            
            // pick the first entries needed to get the total diff under the threshold
            const neededSponsorshipAddresses = sortedSponsorships.slice(0, neededSponsorshipsCount).map((sponsorship: any) => sponsorship.address)
            logger.info(`Updating ${neededSponsorshipAddresses.length} sponsorships: ${neededSponsorshipAddresses}`)
            this.helper.updateApproximatePoolvalueOfSponsorships(neededSponsorshipAddresses)
            logger.info(`Updated sponsorships!`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        logger.info('MaintainOperatorValueService stopped')
        clearInterval(this.checkValueInterval!)
    }
}
