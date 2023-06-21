import { Logger } from '@streamr/utils'
import { Contract } from 'ethers'
import { Operator, StreamrConfig, operatorABI, streamrConfigABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

export class MaintainOperatorValueHelper {
    private readonly config: OperatorServiceConfig
    private readonly operator: Operator

    constructor(config: OperatorServiceConfig) {
        this.config = config
        this.operator = new Contract(config.operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
    }

    /// returns a wei value (1 ETH means 100%)
    async getPenaltyLimitFraction(): Promise<bigint> {
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.provider) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    async getApproximatePoolValuesPerSponsorship(): Promise<any> {
        return await this.operator.getApproximatePoolValuesPerSponsorship()
    }

    async updateApproximatePoolvalueOfSponsorships(sponsorshipAddresses: string[]): Promise<void> {
        await (await this.operator.updateApproximatePoolvalueOfSponsorships(sponsorshipAddresses)).wait()
    }
}
