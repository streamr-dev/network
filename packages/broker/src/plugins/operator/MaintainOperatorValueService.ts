import { Contract } from "@ethersproject/contracts"
import { StreamrConfig, operatorABI, streamrConfigABI } from "@streamr/network-contracts"
import { Operator } from '@streamr/network-contracts'
import { Logger } from '@streamr/utils'
import { OperatorClientConfig } from "./OperatorClient"

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 * 24 // 1 day

export class MaintainOperatorValueService {
    config: OperatorClientConfig
    private checkValueInterval: NodeJS.Timeout | null = null

    constructor(config: OperatorClientConfig) {
        logger.trace('MaintainOperatorValueService created')
        this.config = config
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
        logger.info('started MaintainOperatorValueService')
        this.checkValueInterval = setInterval(async () => {
            await this.checkValue(this.config.operatorContractAddress)
        }, CHECK_VALUE_INTERVAL)
    }

    async checkValue(operatorContractAddress: string, threshold?: bigint): Promise<void> {
        logger.info(`checkValue for operator contract ${operatorContractAddress} and threshold ${threshold}`)

        const operator = new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator

        logger.info(`created operator contract: ${operator.address}`)
        
        // treshold is a wei fraction, set in config.poolValueDriftLimitFraction
        if (!threshold) {
            const streamrConfigAddress = await operator.streamrConfig()
            const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.provider) as unknown as StreamrConfig
            threshold = (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
            logger.info(`set threshold from streamr config: ${threshold}`)
        }

        const { sponsorshipAddresses, approxValues, realValues } = await operator.getApproximatePoolValuesPerSponsorship()
        logger.info(`sponsorshipAddresses (${sponsorshipAddresses.length}): ${sponsorshipAddresses}`)
        logger.info(`approxValues (${approxValues.length}): ${approxValues}`)
        logger.info(`realValues (${realValues.length}): ${realValues}`)

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
            
            // pick the first OPERATOR_VALUE_UPDATE_ITEMS entries
            const neededSponsorshipAddresses = sortedSponsorships.slice(0, neededSponsorshipsCount).map((sponsorship: any) => sponsorship.address)
            logger.info(`Updating ${neededSponsorshipAddresses.length} sponsorships: ${neededSponsorshipAddresses}`)
            await (await operator.updateApproximatePoolvalueOfSponsorships(neededSponsorshipAddresses)).wait()
            logger.info(`Updated sponsorships!`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        logger.info('stopped MaintainOperatorValueService')
        clearInterval(this.checkValueInterval!)
    }
}
