import { Logger } from '@streamr/utils'
import { OperatorClientConfig } from "./OperatorClient"
import { Contract } from 'ethers'
import { Operator, StreamrConfig, operatorABI, streamrConfigABI } from '@streamr/network-contracts'

const logger = new Logger(module)

export class MaintainOperatorValueHelper {
    config: OperatorClientConfig
    operator: Operator

    constructor(config: OperatorClientConfig) {
        logger.trace('MaintainOperatorValueHelper created')
        this.config = config
        this.operator = new Contract(config.operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
    }

    async getThreshold(): Promise<bigint> {
        logger.info(`getThreshold for operator ${this.operator.address}`)
        // treshold is a wei fraction, set in config.poolValueDriftLimitFraction
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.provider) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    async getApproximatePoolValuesPerSponsorship(): Promise<any> {
        logger.info(`getApproximatePoolValuesPerSponsorship for operator ${this.operator.address}`)
        return await this.operator.getApproximatePoolValuesPerSponsorship()
    }

    async updateApproximatePoolvalueOfSponsorships(sponsorshipAddresses: string[]): Promise<void> {
        logger.info(`updateApproximatePoolvalueOfSponsorships for operator ${this.operator.address}`)
        await (await this.operator.updateApproximatePoolvalueOfSponsorships(sponsorshipAddresses)).wait()
    }
}
