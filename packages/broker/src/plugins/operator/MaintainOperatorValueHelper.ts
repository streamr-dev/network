import { BigNumber, Contract } from 'ethers'
import { Operator, StreamrConfig, operatorABI, streamrConfigABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { EthereumAddress } from 'streamr-client'
import { Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import fetch from 'node-fetch'
import sample from 'lodash/sample'

const logger = new Logger(module)

const ONE_ETHER = BigInt(1e18)

interface UnwithdrawnEarningsData {
    sumDataWei: bigint
    fraction: bigint
    sponsorshipAddresses: EthereumAddress[]
}

export class MaintainOperatorValueHelper {
    private readonly operator: Operator
    private readonly theGraphClient: TheGraphClient
    private readonly config: OperatorServiceConfig

    constructor(config: OperatorServiceConfig) {
        this.config = config
        this.operator = new Contract(config.operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: config.theGraphUrl,
            fetch,
            logger
        })
    }

    async getRandomOperator(): Promise<EthereumAddress | undefined> {
        const latestBlock = await this.operator.provider.getBlockNumber()
        const operators = await this.getOperatorAddresses(latestBlock)
        // filter out my own operator
        const operatorAddresses = operators.filter((id) => id !== this.config.operatorContractAddress)
        logger.debug(`Found ${operatorAddresses.length} operators`, { operatorAddresses })
        return sample(operatorAddresses)
    }

    /**
     * The "hard limit" for paying out rewards to `withdrawEarningsFromSponsorships` caller.
     * Operator is expected to call `withdrawEarningsFromSponsorships` before
     *   `unwithdrawn earnings / (total staked + free funds)` exceeds this limit.
     * @returns a "wei" fraction: 1e18 or "1 ether" means limit is at unwithdrawn earnings == total staked + free funds
     */
    async getDriftLimitFraction(): Promise<bigint> {
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.signer) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    /**
     * Find the sum of unwithdrawn earnings in Sponsorships (that the Operator must withdraw before the sum reaches a limit),
     * SUBJECT TO the constraints, set in the OperatorServiceConfig:
     *  - only take at most maxSponsorshipsInWithdraw addresses (those with most earnings), or all if undefined
     *  - only take sponsorships that have more than minSponsorshipEarningsInWithdraw, or all if undefined
     * @param operatorContractAddress
     */
    async getUnwithdrawnEarningsOf(operatorContractAddress: EthereumAddress): Promise<UnwithdrawnEarningsData> {
        const operator = new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        const minSponsorshipEarningsInWithdrawWei = BigNumber.from(this.config.minSponsorshipEarningsInWithdraw ?? 0)
        const { sponsorshipAddresses: allSponsorshipAddresses, earnings } = await operator.getEarningsFromSponsorships()

        const sponsorships = allSponsorshipAddresses
            .map((address, i) => ({ address, earnings: earnings[i] }))
            .filter((sponsorship) => sponsorship.earnings.gte(minSponsorshipEarningsInWithdrawWei))
            .sort((a, b) => Number(b.earnings.sub(a.earnings).toBigInt())) // TODO: after Node 20, use .toSorted() instead
            .slice(0, this.config.maxSponsorshipsInWithdraw) // take all if maxSponsorshipsInWithdraw is undefined
        const sponsorshipAddresses = sponsorships.map((sponsorship) => toEthereumAddress(sponsorship.address))

        const approxPoolValue = (await operator.totalStakedIntoSponsorshipsWei()).toBigInt()
        const sumDataWei = sponsorships.reduce((sum, sponsorship) => sum.add(sponsorship.earnings), BigNumber.from(0)).toBigInt()
        const fraction = approxPoolValue > 0
            ? sumDataWei * ONE_ETHER / approxPoolValue
            : BigInt(0)

        return { sumDataWei, fraction, sponsorshipAddresses }
    }

    async getMyUnwithdrawnEarnings(): Promise<UnwithdrawnEarningsData> {
        return this.getUnwithdrawnEarningsOf(this.config.operatorContractAddress)
    }

    async withdrawEarningsFromSponsorshipsToOperatorContract(sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operator.withdrawEarningsFromSponsorships(sponsorshipAddresses)).wait()
    }

    async triggerWithdraw(targetOperatorAddress: EthereumAddress, sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operator.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)).wait()
    }

    private async getOperatorAddresses(requiredBlockNumber: number): Promise<EthereumAddress[]> {
        const createQuery = () => {
            return {
                query: `
                    {
                        operators {
                            id
                        }
                    }
                    `
            }
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<{ id: string }>(createQuery)

        const operatorAddresses: EthereumAddress[] = []
        for await (const operator of queryResult) {
            operatorAddresses.push(toEthereumAddress(operator.id))
        }
        return operatorAddresses
    }
}
